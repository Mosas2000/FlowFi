import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeploymentInfo {
    network: string;
    chainId: number;
    timestamp: string;
    deployer: string;
    contracts: {
        MockUSDC: string;
        InvoiceNFT: string;
        LendingPool: string;
    };
}

async function main() {
    try {
        console.log("🚀 Starting FlowFi deployment to Mantle Testnet...\n");

        // Get deployer account
        const [deployer] = await ethers.getSigners();
        const network = await ethers.provider.getNetwork();

        console.log("📋 Deployment Details:");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);
        console.log(`Deployer: ${deployer.address}`);
        console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} MNT\n`);

        // Deploy MockUSDC
        console.log("📝 Deploying MockUSDC...");
        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        const mockUSDC = await MockUSDC.deploy();
        await mockUSDC.waitForDeployment();
        const mockUSDCAddress = await mockUSDC.getAddress();
        console.log(`✅ MockUSDC deployed to: ${mockUSDCAddress}\n`);

        // Deploy InvoiceNFT
        console.log("📝 Deploying InvoiceNFT...");
        const InvoiceNFT = await ethers.getContractFactory("InvoiceNFT");
        const invoiceNFT = await InvoiceNFT.deploy();
        await invoiceNFT.waitForDeployment();
        const invoiceNFTAddress = await invoiceNFT.getAddress();
        console.log(`✅ InvoiceNFT deployed to: ${invoiceNFTAddress}\n`);

        // Deploy LendingPool
        console.log("📝 Deploying LendingPool...");
        const LendingPool = await ethers.getContractFactory("LendingPool");
        const lendingPool = await LendingPool.deploy(invoiceNFTAddress, mockUSDCAddress);
        await lendingPool.waitForDeployment();
        const lendingPoolAddress = await lendingPool.getAddress();
        console.log(`✅ LendingPool deployed to: ${lendingPoolAddress}\n`);

        // Set LendingPool as approved operator in InvoiceNFT
        console.log("🔧 Configuring contracts...");
        console.log("Setting LendingPool as approved operator in InvoiceNFT...");
        const setApprovalTx = await invoiceNFT.setApprovalForAll(lendingPoolAddress, true);
        await setApprovalTx.wait();
        console.log("✅ LendingPool approved as operator\n");

        // Prepare deployment info
        const deploymentInfo: DeploymentInfo = {
            network: network.name,
            chainId: Number(network.chainId),
            timestamp: new Date().toISOString(),
            deployer: deployer.address,
            contracts: {
                MockUSDC: mockUSDCAddress,
                InvoiceNFT: invoiceNFTAddress,
                LendingPool: lendingPoolAddress,
            },
        };

        // Save deployment info to file
        const deploymentsDir = path.join(__dirname, "..", "deployments");
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir, { recursive: true });
        }

        const deploymentFile = path.join(deploymentsDir, `${network.name}-${network.chainId}.json`);
        fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

        // Display summary
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("🎉 Deployment Summary");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`Network:        ${network.name}`);
        console.log(`Chain ID:       ${network.chainId}`);
        console.log(`Deployer:       ${deployer.address}`);
        console.log(`Timestamp:      ${deploymentInfo.timestamp}\n`);
        console.log("📜 Deployed Contracts:");
        console.log(`MockUSDC:       ${mockUSDCAddress}`);
        console.log(`InvoiceNFT:     ${invoiceNFTAddress}`);
        console.log(`LendingPool:    ${lendingPoolAddress}\n`);
        console.log(`💾 Deployment info saved to: ${deploymentFile}\n`);

        // Verification commands
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("🔍 Verification Commands");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("To verify contracts on block explorer, run:\n");
        console.log(`npx hardhat verify --network mantle-testnet ${mockUSDCAddress}`);
        console.log(`npx hardhat verify --network mantle-testnet ${invoiceNFTAddress}`);
        console.log(`npx hardhat verify --network mantle-testnet ${lendingPoolAddress} "${invoiceNFTAddress}" "${mockUSDCAddress}"`);
        console.log("\n✨ Deployment completed successfully!");

    } catch (error) {
        console.error("\n❌ Deployment failed!");
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        if (error instanceof Error) {
            console.error(`Error: ${error.message}`);

            // Provide helpful error messages
            if (error.message.includes("insufficient funds")) {
                console.error("\n💡 Tip: Make sure your deployer account has enough MNT tokens.");
                console.error("You can get testnet MNT from: https://faucet.testnet.mantle.xyz/");
            } else if (error.message.includes("nonce")) {
                console.error("\n💡 Tip: Try resetting your account nonce or wait a moment and try again.");
            } else if (error.message.includes("network")) {
                console.error("\n💡 Tip: Check your network configuration in hardhat.config.ts");
                console.error("Ensure PRIVATE_KEY is set in your .env file.");
            }

            console.error("\nStack trace:");
            console.error(error.stack);
        } else {
            console.error(error);
        }

        process.exit(1);
    }
}

// Execute deployment
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
