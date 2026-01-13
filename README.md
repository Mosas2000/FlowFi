# FlowFi - Invoice Financing Platform

A decentralized invoice financing platform built on Mantle Network using Hardhat and TypeScript.

## Overview

FlowFi enables suppliers to get immediate financing for their invoices through a trustless smart contract system on the Mantle Network.

## Features

- **Invoice Creation**: Suppliers can create invoices with buyer information and due dates
- **Invoice Financing**: Financiers can provide instant liquidity to suppliers
- **Payment Tracking**: Automated tracking of invoice payment status
- **Security**: Built with OpenZeppelin contracts for enhanced security

## Tech Stack

- **Blockchain**: Mantle Network (Testnet)
- **Framework**: Hardhat
- **Language**: TypeScript, Solidity 0.8.20
- **Libraries**: OpenZeppelin Contracts, Ethers.js

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
   - Copy `.env` file and add your private key:
   ```
   PRIVATE_KEY=your_private_key_here
   ```

## Usage

### Compile Contracts
```bash
npx hardhat compile
```

### Run Tests
```bash
npx hardhat test
```

### Deploy to Mantle Testnet
```bash
npx hardhat run scripts/deploy.ts --network mantleTestnet
```

The deployment script will:
- Deploy MockUSDC (test token with 6 decimals)
- Deploy InvoiceNFT (ERC721 for tokenizing invoices)
- Deploy LendingPool (main lending contract)
- Configure LendingPool as approved operator
- Save deployment addresses to `deployments/` directory

### Deploy to Local Network
```bash
# Start local node
npx hardhat node

# Deploy (in another terminal)
npx hardhat run scripts/deploy.ts --network localhost
```

### Verify Contracts
After deployment, verify contracts on block explorer:
```bash
npx hardhat verify --network mantleTestnet <CONTRACT_ADDRESS>
```

## Contracts

### InvoiceNFT
ERC721 token representing invoices with metadata:
- Invoice amount, due date, debtor information
- Transfer restrictions (only borrower or contract owner)
- Minting function for creating invoice NFTs

### LendingPool
Main lending contract with features:
- Lender deposits/withdrawals (USDC)
- Loan requests (80% LTV on invoice value)
- Loan funding and repayment
- NFT claiming for defaulted loans
- Borrower reputation tracking

### MockUSDC
Test ERC20 token (6 decimals) for local testing

## Network Configuration

- **Network**: Mantle Testnet
- **RPC URL**: https://rpc.testnet.mantle.xyz
- **Chain ID**: 5003

## Project Structure

```
FlowFi/
├── contracts/          # Solidity smart contracts
├── scripts/           # Deployment scripts
├── test/              # Test files
├── hardhat.config.ts  # Hardhat configuration
├── tsconfig.json      # TypeScript configuration
└── .env               # Environment variables
```

## Security

- Never commit your `.env` file
- Keep your private keys secure
- Audit contracts before mainnet deployment

## License

MIT
