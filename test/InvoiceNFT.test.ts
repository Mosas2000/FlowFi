import { expect } from "chai";
import { ethers } from "hardhat";
import type { InvoiceNFT } from "../typechain-types";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("InvoiceNFT", function () {
    let invoiceNFT: InvoiceNFT;
    let owner: SignerWithAddress;
    let borrower: SignerWithAddress;
    let otherUser: SignerWithAddress;

    beforeEach(async function () {
        [owner, borrower, otherUser] = await ethers.getSigners();

        const InvoiceNFT = await ethers.getContractFactory("InvoiceNFT");
        invoiceNFT = await InvoiceNFT.deploy();
        await invoiceNFT.waitForDeployment();
    });

    describe("Minting", function () {
        it("Should mint an invoice NFT with correct details", async function () {
            const amount = ethers.parseEther("1000");
            const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days from now
            const debtor = "Acme Corp";
            const invoiceHash = ethers.keccak256(ethers.toUtf8Bytes("invoice-123"));

            await expect(
                invoiceNFT.connect(borrower).mintInvoice(amount, dueDate, debtor, invoiceHash)
            )
                .to.emit(invoiceNFT, "InvoiceMinted")
                .withArgs(0, borrower.address, amount, dueDate, debtor);

            const details = await invoiceNFT.getInvoiceDetails(0);
            expect(details.invoiceAmount).to.equal(amount);
            expect(details.dueDate).to.equal(dueDate);
            expect(details.debtor).to.equal(debtor);
            expect(details.invoiceHash).to.equal(invoiceHash);
            expect(details.borrower).to.equal(borrower.address);

            expect(await invoiceNFT.ownerOf(0)).to.equal(borrower.address);
        });

        it("Should increment token IDs correctly", async function () {
            const amount = ethers.parseEther("1000");
            const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30;
            const debtor = "Acme Corp";
            const invoiceHash = ethers.keccak256(ethers.toUtf8Bytes("invoice-123"));

            await invoiceNFT.connect(borrower).mintInvoice(amount, dueDate, debtor, invoiceHash);
            await invoiceNFT.connect(borrower).mintInvoice(amount, dueDate, debtor, invoiceHash);

            expect(await invoiceNFT.ownerOf(0)).to.equal(borrower.address);
            expect(await invoiceNFT.ownerOf(1)).to.equal(borrower.address);
        });

        it("Should fail to mint with invalid parameters", async function () {
            const amount = ethers.parseEther("1000");
            const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30;
            const pastDate = Math.floor(Date.now() / 1000) - 86400;
            const debtor = "Acme Corp";
            const invoiceHash = ethers.keccak256(ethers.toUtf8Bytes("invoice-123"));

            // Zero amount
            await expect(
                invoiceNFT.connect(borrower).mintInvoice(0, dueDate, debtor, invoiceHash)
            ).to.be.revertedWith("Invoice amount must be greater than 0");

            // Past due date
            await expect(
                invoiceNFT.connect(borrower).mintInvoice(amount, pastDate, debtor, invoiceHash)
            ).to.be.revertedWith("Due date must be in the future");

            // Empty debtor
            await expect(
                invoiceNFT.connect(borrower).mintInvoice(amount, dueDate, "", invoiceHash)
            ).to.be.revertedWith("Debtor cannot be empty");

            // Empty hash
            await expect(
                invoiceNFT.connect(borrower).mintInvoice(amount, dueDate, debtor, ethers.ZeroHash)
            ).to.be.revertedWith("Invoice hash cannot be empty");
        });
    });

    describe("Transfer Restrictions", function () {
        let tokenId: number;

        beforeEach(async function () {
            const amount = ethers.parseEther("1000");
            const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30;
            const debtor = "Acme Corp";
            const invoiceHash = ethers.keccak256(ethers.toUtf8Bytes("invoice-123"));

            await invoiceNFT.connect(borrower).mintInvoice(amount, dueDate, debtor, invoiceHash);
            tokenId = 0;
        });

        it("Should allow borrower to transfer NFT", async function () {
            await expect(
                invoiceNFT.connect(borrower).transferFrom(borrower.address, otherUser.address, tokenId)
            ).to.not.be.reverted;

            expect(await invoiceNFT.ownerOf(tokenId)).to.equal(otherUser.address);
        });

        it("Should allow contract owner to transfer NFT", async function () {
            // Borrower approves the owner to transfer
            await invoiceNFT.connect(borrower).approve(owner.address, tokenId);

            await expect(
                invoiceNFT.connect(owner).transferFrom(borrower.address, otherUser.address, tokenId)
            ).to.not.be.reverted;

            expect(await invoiceNFT.ownerOf(tokenId)).to.equal(otherUser.address);
        });

        it("Should prevent unauthorized users from transferring NFT", async function () {
            await expect(
                invoiceNFT.connect(otherUser).transferFrom(borrower.address, otherUser.address, tokenId)
            ).to.be.reverted;
        });
    });

    describe("Query Functions", function () {
        it("Should return correct invoice details", async function () {
            const amount = ethers.parseEther("1000");
            const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30;
            const debtor = "Acme Corp";
            const invoiceHash = ethers.keccak256(ethers.toUtf8Bytes("invoice-123"));

            await invoiceNFT.connect(borrower).mintInvoice(amount, dueDate, debtor, invoiceHash);

            const details = await invoiceNFT.getInvoiceDetails(0);
            expect(details.invoiceAmount).to.equal(amount);
            expect(details.dueDate).to.equal(dueDate);
            expect(details.debtor).to.equal(debtor);
            expect(details.invoiceHash).to.equal(invoiceHash);
            expect(details.borrower).to.equal(borrower.address);
        });

        it("Should fail to get details for non-existent token", async function () {
            await expect(invoiceNFT.getInvoiceDetails(999)).to.be.revertedWith(
                "Token does not exist"
            );
        });
    });
});
