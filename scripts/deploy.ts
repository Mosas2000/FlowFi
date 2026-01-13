import { ethers } from "hardhat";

async function main() {
    console.log("Deploying InvoiceFinancing contract to Mantle Network...");

    const InvoiceFinancing = await ethers.getContractFactory("InvoiceFinancing");
    const invoiceFinancing = await InvoiceFinancing.deploy();

    await invoiceFinancing.waitForDeployment();

    const address = await invoiceFinancing.getAddress();
    console.log(`InvoiceFinancing deployed to: ${address}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
