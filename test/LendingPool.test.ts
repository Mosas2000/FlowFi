import { expect } from "chai";
import { ethers } from "hardhat";
import type { LendingPool, InvoiceNFT, MockUSDC } from "../typechain-types";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("LendingPool", function () {
    let lendingPool: LendingPool;
    let invoiceNFT: InvoiceNFT;
    let usdcToken: MockUSDC;
    let owner: SignerWithAddress;
    let borrower: SignerWithAddress;
    let lender: SignerWithAddress;
    let otherUser: SignerWithAddress;

    const USDC_DECIMALS = 6;
    const parseUSDC = (amount: string) => ethers.parseUnits(amount, USDC_DECIMALS);

    beforeEach(async function () {
        [owner, borrower, lender, otherUser] = await ethers.getSigners();

        // Deploy MockUSDC
        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        usdcToken = await MockUSDC.deploy();
        await usdcToken.waitForDeployment();

        // Deploy InvoiceNFT
        const InvoiceNFT = await ethers.getContractFactory("InvoiceNFT");
        invoiceNFT = await InvoiceNFT.deploy();
        await invoiceNFT.waitForDeployment();

        // Deploy LendingPool
        const LendingPool = await ethers.getContractFactory("LendingPool");
        lendingPool = await LendingPool.deploy(
            await invoiceNFT.getAddress(),
            await usdcToken.getAddress()
        );
        await lendingPool.waitForDeployment();

        // Mint USDC to lender and borrower for testing
        await usdcToken.mint(lender.address, parseUSDC("100000"));
        await usdcToken.mint(borrower.address, parseUSDC("100000"));
    });

    describe("Deployment", function () {
        it("Should set the correct InvoiceNFT and USDC addresses", async function () {
            expect(await lendingPool.invoiceNFT()).to.equal(await invoiceNFT.getAddress());
            expect(await lendingPool.usdcToken()).to.equal(await usdcToken.getAddress());
        });

        it("Should set the correct owner", async function () {
            expect(await lendingPool.owner()).to.equal(owner.address);
        });
    });

    describe("Deposit and Withdraw", function () {
        it("Should allow lenders to deposit USDC", async function () {
            const depositAmount = parseUSDC("10000");

            await usdcToken.connect(lender).approve(await lendingPool.getAddress(), depositAmount);

            await expect(lendingPool.connect(lender).deposit(depositAmount))
                .to.emit(lendingPool, "Deposited")
                .withArgs(lender.address, depositAmount);

            expect(await lendingPool.getLenderBalance(lender.address)).to.equal(depositAmount);
        });

        it("Should allow lenders to withdraw USDC", async function () {
            const depositAmount = parseUSDC("10000");
            const withdrawAmount = parseUSDC("5000");

            await usdcToken.connect(lender).approve(await lendingPool.getAddress(), depositAmount);
            await lendingPool.connect(lender).deposit(depositAmount);

            await expect(lendingPool.connect(lender).withdraw(withdrawAmount))
                .to.emit(lendingPool, "Withdrawn")
                .withArgs(lender.address, withdrawAmount);

            expect(await lendingPool.getLenderBalance(lender.address)).to.equal(
                depositAmount - withdrawAmount
            );
        });

        it("Should fail to withdraw more than deposited", async function () {
            const depositAmount = parseUSDC("10000");
            const withdrawAmount = parseUSDC("15000");

            await usdcToken.connect(lender).approve(await lendingPool.getAddress(), depositAmount);
            await lendingPool.connect(lender).deposit(depositAmount);

            await expect(
                lendingPool.connect(lender).withdraw(withdrawAmount)
            ).to.be.revertedWith("Insufficient balance");
        });
    });

    describe("Loan Request Creation", function () {
        let tokenId: number;

        beforeEach(async function () {
            const amount = parseUSDC("10000");
            const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days
            const debtor = "Acme Corp";
            const invoiceHash = ethers.keccak256(ethers.toUtf8Bytes("invoice-123"));

            await invoiceNFT
                .connect(borrower)
                .mintInvoice(amount, dueDate, debtor, invoiceHash);
            tokenId = 0;
        });

        it("Should create a loan request for 80% of invoice amount", async function () {
            const invoiceAmount = parseUSDC("10000");
            const expectedLoanAmount = parseUSDC("8000"); // 80%
            const expectedRepaymentAmount = parseUSDC("10000"); // 100%

            await invoiceNFT.connect(borrower).approve(await lendingPool.getAddress(), tokenId);

            await expect(lendingPool.connect(borrower).createLoanRequest(tokenId))
                .to.emit(lendingPool, "LoanRequestCreated");

            const loan = await lendingPool.getLoanRequest(0);
            expect(loan.tokenId).to.equal(tokenId);
            expect(loan.borrower).to.equal(borrower.address);
            expect(loan.loanAmount).to.equal(expectedLoanAmount);
            expect(loan.repaymentAmount).to.equal(expectedRepaymentAmount);
            expect(loan.isActive).to.be.false;
            expect(loan.isRepaid).to.be.false;

            // NFT should be transferred to lending pool
            expect(await invoiceNFT.ownerOf(tokenId)).to.equal(await lendingPool.getAddress());
        });

        it("Should fail if not the invoice owner", async function () {
            await invoiceNFT.connect(borrower).approve(await lendingPool.getAddress(), tokenId);

            await expect(
                lendingPool.connect(otherUser).createLoanRequest(tokenId)
            ).to.be.revertedWith("Not the invoice owner");
        });
    });

    describe("Loan Funding", function () {
        let tokenId: number;
        let loanId: number;

        beforeEach(async function () {
            const amount = parseUSDC("10000");
            const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30;
            const debtor = "Acme Corp";
            const invoiceHash = ethers.keccak256(ethers.toUtf8Bytes("invoice-123"));

            await invoiceNFT
                .connect(borrower)
                .mintInvoice(amount, dueDate, debtor, invoiceHash);
            tokenId = 0;

            await invoiceNFT.connect(borrower).approve(await lendingPool.getAddress(), tokenId);
            await lendingPool.connect(borrower).createLoanRequest(tokenId);
            loanId = 0;

            // Lender deposits USDC
            const depositAmount = parseUSDC("20000");
            await usdcToken.connect(lender).approve(await lendingPool.getAddress(), depositAmount);
            await lendingPool.connect(lender).deposit(depositAmount);
        });

        it("Should allow lender to fund a loan", async function () {
            const loanAmount = parseUSDC("8000");
            const initialBorrowerBalance = await usdcToken.balanceOf(borrower.address);

            await expect(lendingPool.connect(lender).fundLoan(loanId))
                .to.emit(lendingPool, "LoanFunded")
                .withArgs(loanId, lender.address, loanAmount);

            const loan = await lendingPool.getLoanRequest(loanId);
            expect(loan.lender).to.equal(lender.address);
            expect(loan.isActive).to.be.true;

            // Check borrower received USDC
            expect(await usdcToken.balanceOf(borrower.address)).to.equal(
                initialBorrowerBalance + loanAmount
            );

            // Check lender's deposit decreased
            expect(await lendingPool.getLenderBalance(lender.address)).to.equal(
                parseUSDC("20000") - loanAmount
            );
        });

        it("Should fail to fund with insufficient balance", async function () {
            // Withdraw most of the deposit
            await lendingPool.connect(lender).withdraw(parseUSDC("15000"));

            await expect(lendingPool.connect(lender).fundLoan(loanId)).to.be.revertedWith(
                "Insufficient lender balance"
            );
        });

        it("Should fail to fund already funded loan", async function () {
            await lendingPool.connect(lender).fundLoan(loanId);

            await expect(lendingPool.connect(lender).fundLoan(loanId)).to.be.revertedWith(
                "Loan already funded"
            );
        });
    });

    describe("Loan Repayment", function () {
        let tokenId: number;
        let loanId: number;

        beforeEach(async function () {
            const amount = parseUSDC("10000");
            const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30;
            const debtor = "Acme Corp";
            const invoiceHash = ethers.keccak256(ethers.toUtf8Bytes("invoice-123"));

            await invoiceNFT
                .connect(borrower)
                .mintInvoice(amount, dueDate, debtor, invoiceHash);
            tokenId = 0;

            await invoiceNFT.connect(borrower).approve(await lendingPool.getAddress(), tokenId);
            await lendingPool.connect(borrower).createLoanRequest(tokenId);
            loanId = 0;

            // Lender deposits and funds loan
            const depositAmount = parseUSDC("20000");
            await usdcToken.connect(lender).approve(await lendingPool.getAddress(), depositAmount);
            await lendingPool.connect(lender).deposit(depositAmount);
            await lendingPool.connect(lender).fundLoan(loanId);
        });

        it("Should allow borrower to repay loan", async function () {
            const repaymentAmount = parseUSDC("10000");
            const initialLenderBalance = await usdcToken.balanceOf(lender.address);

            await usdcToken.connect(borrower).approve(await lendingPool.getAddress(), repaymentAmount);

            await expect(lendingPool.connect(borrower).repayLoan(loanId))
                .to.emit(lendingPool, "LoanRepaid")
                .withArgs(loanId, borrower.address, repaymentAmount);

            const loan = await lendingPool.getLoanRequest(loanId);
            expect(loan.isRepaid).to.be.true;

            // Check lender received repayment
            expect(await usdcToken.balanceOf(lender.address)).to.equal(
                initialLenderBalance + repaymentAmount
            );

            // Check NFT returned to borrower
            expect(await invoiceNFT.ownerOf(tokenId)).to.equal(borrower.address);

            // Check reputation increased
            expect(await lendingPool.getBorrowerReputation(borrower.address)).to.equal(1);
        });

        it("Should fail if not the borrower", async function () {
            const repaymentAmount = parseUSDC("10000");
            await usdcToken.connect(otherUser).approve(await lendingPool.getAddress(), repaymentAmount);

            await expect(lendingPool.connect(otherUser).repayLoan(loanId)).to.be.revertedWith(
                "Not the borrower"
            );
        });

        it("Should fail to repay inactive loan", async function () {
            // Create another loan request that's not funded
            const amount = parseUSDC("5000");
            const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30;
            const debtor = "Test Corp";
            const invoiceHash = ethers.keccak256(ethers.toUtf8Bytes("invoice-456"));

            await invoiceNFT
                .connect(borrower)
                .mintInvoice(amount, dueDate, debtor, invoiceHash);
            const newTokenId = 1;

            await invoiceNFT.connect(borrower).approve(await lendingPool.getAddress(), newTokenId);
            await lendingPool.connect(borrower).createLoanRequest(newTokenId);
            const newLoanId = 1;

            await expect(lendingPool.connect(borrower).repayLoan(newLoanId)).to.be.revertedWith(
                "Loan not active"
            );
        });
    });

    describe("NFT Claiming on Default", function () {
        let tokenId: number;
        let loanId: number;
        let snapshotId: string;

        beforeEach(async function () {
            // Take a snapshot before each test
            snapshotId = await ethers.provider.send("evm_snapshot", []);
            const amount = parseUSDC("10000");
            const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days
            const debtor = "Acme Corp";
            const invoiceHash = ethers.keccak256(ethers.toUtf8Bytes("invoice-123"));

            await invoiceNFT
                .connect(borrower)
                .mintInvoice(amount, dueDate, debtor, invoiceHash);
            tokenId = 0;

            await invoiceNFT.connect(borrower).approve(await lendingPool.getAddress(), tokenId);
            await lendingPool.connect(borrower).createLoanRequest(tokenId);
            loanId = 0;

            // Lender deposits and funds loan
            const depositAmount = parseUSDC("20000");
            await usdcToken.connect(lender).approve(await lendingPool.getAddress(), depositAmount);
            await lendingPool.connect(lender).deposit(depositAmount);
            await lendingPool.connect(lender).fundLoan(loanId);
        });

        afterEach(async function () {
            // Revert to snapshot after each test to reset blockchain state
            await ethers.provider.send("evm_revert", [snapshotId]);
        });

        it("Should allow lender to claim NFT after default", async function () {
            // Fast forward time past due date
            await ethers.provider.send("evm_increaseTime", [86400 * 31]); // 31 days
            await ethers.provider.send("evm_mine", []);

            await expect(lendingPool.connect(lender).claimDefaultedNFT(loanId))
                .to.emit(lendingPool, "NFTClaimed")
                .withArgs(loanId, lender.address, tokenId);

            // Check NFT transferred to lender
            expect(await invoiceNFT.ownerOf(tokenId)).to.equal(lender.address);

            const loan = await lendingPool.getLoanRequest(loanId);
            expect(loan.isRepaid).to.be.true; // Marked as repaid to prevent double claiming
        });

        it("Should fail to claim before due date", async function () {
            await expect(lendingPool.connect(lender).claimDefaultedNFT(loanId)).to.be.revertedWith(
                "Loan not yet defaulted"
            );
        });

        it("Should fail if not the lender", async function () {
            // Fast forward time past due date
            await ethers.provider.send("evm_increaseTime", [86400 * 31]); // 31 days
            await ethers.provider.send("evm_mine", []);

            await expect(lendingPool.connect(otherUser).claimDefaultedNFT(loanId)).to.be.revertedWith(
                "Not the lender"
            );
        });
    });
});
