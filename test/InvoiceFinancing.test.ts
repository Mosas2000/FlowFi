import { expect } from "chai";
import { ethers } from "hardhat";
import type { InvoiceFinancing } from "../typechain-types";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("InvoiceFinancing", function () {
    let invoiceFinancing: InvoiceFinancing;
    let owner: SignerWithAddress;
    let supplier: SignerWithAddress;
    let buyer: SignerWithAddress;
    let financier: SignerWithAddress;

    beforeEach(async function () {
        [owner, supplier, buyer, financier] = await ethers.getSigners();

        const InvoiceFinancing = await ethers.getContractFactory("InvoiceFinancing");
        invoiceFinancing = await InvoiceFinancing.deploy();
        await invoiceFinancing.waitForDeployment();
    });

    describe("Invoice Creation", function () {
        it("Should create a new invoice", async function () {
            const amount = ethers.parseEther("1.0");
            const dueDate = Math.floor(Date.now() / 1000) + 86400; // 1 day from now

            await expect(
                invoiceFinancing.connect(supplier).createInvoice(buyer.address, amount, dueDate)
            )
                .to.emit(invoiceFinancing, "InvoiceCreated")
                .withArgs(0, supplier.address, buyer.address, amount);

            const invoice = await invoiceFinancing.getInvoice(0);
            expect(invoice.supplier).to.equal(supplier.address);
            expect(invoice.buyer).to.equal(buyer.address);
            expect(invoice.amount).to.equal(amount);
            expect(invoice.isPaid).to.be.false;
            expect(invoice.isFinanced).to.be.false;
        });

        it("Should fail to create invoice with invalid parameters", async function () {
            const amount = ethers.parseEther("1.0");
            const pastDate = Math.floor(Date.now() / 1000) - 86400; // 1 day ago

            await expect(
                invoiceFinancing.connect(supplier).createInvoice(ethers.ZeroAddress, amount, pastDate)
            ).to.be.revertedWith("Invalid buyer address");
        });
    });

    describe("Invoice Financing", function () {
        it("Should finance an invoice", async function () {
            const amount = ethers.parseEther("1.0");
            const dueDate = Math.floor(Date.now() / 1000) + 86400;

            await invoiceFinancing.connect(supplier).createInvoice(buyer.address, amount, dueDate);

            await expect(
                invoiceFinancing.connect(financier).financeInvoice(0, { value: amount })
            )
                .to.emit(invoiceFinancing, "InvoiceFinanced")
                .withArgs(0, financier.address);

            const invoice = await invoiceFinancing.getInvoice(0);
            expect(invoice.isFinanced).to.be.true;
        });
    });

    describe("Invoice Payment", function () {
        it("Should allow buyer to mark invoice as paid", async function () {
            const amount = ethers.parseEther("1.0");
            const dueDate = Math.floor(Date.now() / 1000) + 86400;

            await invoiceFinancing.connect(supplier).createInvoice(buyer.address, amount, dueDate);

            await expect(invoiceFinancing.connect(buyer).payInvoice(0))
                .to.emit(invoiceFinancing, "InvoicePaid")
                .withArgs(0);

            const invoice = await invoiceFinancing.getInvoice(0);
            expect(invoice.isPaid).to.be.true;
        });
    });
});
