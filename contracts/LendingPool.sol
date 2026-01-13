// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./InvoiceNFT.sol";

/**
 * @title LendingPool
 * @dev Lending pool for invoice financing on FlowFi platform
 */
contract LendingPool is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    struct LoanRequest {
        uint256 tokenId;
        address borrower;
        address lender;
        uint256 loanAmount;
        uint256 repaymentAmount;
        uint256 dueDate;
        bool isActive;
        bool isRepaid;
    }

    InvoiceNFT public invoiceNFT;
    IERC20 public usdcToken;

    mapping(address => uint256) public lenderDeposits;
    mapping(address => uint256) public borrowerReputation;
    mapping(uint256 => LoanRequest) public loanRequests;
    uint256 private _loanIdCounter;

    // Constants
    uint256 public constant LOAN_TO_VALUE_RATIO = 80; // 80% LTV
    uint256 public constant REPAYMENT_RATIO = 100; // 100% repayment

    event Deposited(address indexed lender, uint256 amount);
    event Withdrawn(address indexed lender, uint256 amount);
    event LoanRequestCreated(
        uint256 indexed loanId,
        uint256 indexed tokenId,
        address indexed borrower,
        uint256 loanAmount,
        uint256 repaymentAmount,
        uint256 dueDate
    );
    event LoanFunded(uint256 indexed loanId, address indexed lender, uint256 amount);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 amount);
    event NFTClaimed(uint256 indexed loanId, address indexed lender, uint256 tokenId);

    constructor(address _invoiceNFT, address _usdcToken) Ownable(msg.sender) {
        require(_invoiceNFT != address(0), "Invalid InvoiceNFT address");
        require(_usdcToken != address(0), "Invalid USDC address");
        
        invoiceNFT = InvoiceNFT(_invoiceNFT);
        usdcToken = IERC20(_usdcToken);
    }

    /**
     * @dev Lenders deposit USDC into the pool
     * @param amount The amount of USDC to deposit
     */
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");

        lenderDeposits[msg.sender] += amount;
        usdcToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, amount);
    }

    /**
     * @dev Lenders withdraw unused USDC from the pool
     * @param amount The amount of USDC to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(lenderDeposits[msg.sender] >= amount, "Insufficient balance");

        lenderDeposits[msg.sender] -= amount;
        usdcToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @dev Borrower creates a loan request for 80% of invoice amount
     * @param tokenId The ID of the invoice NFT
     * @return loanId The ID of the created loan request
     */
    function createLoanRequest(uint256 tokenId) external nonReentrant returns (uint256) {
        // Get invoice details
        InvoiceNFT.InvoiceDetails memory invoice = invoiceNFT.getInvoiceDetails(tokenId);
        
        require(invoice.borrower == msg.sender, "Not the invoice owner");
        require(invoiceNFT.ownerOf(tokenId) == msg.sender, "Must own the NFT");
        require(invoice.dueDate > block.timestamp, "Invoice already expired");

        // Calculate loan and repayment amounts
        uint256 loanAmount = (invoice.invoiceAmount * LOAN_TO_VALUE_RATIO) / 100;
        uint256 repaymentAmount = (invoice.invoiceAmount * REPAYMENT_RATIO) / 100;

        uint256 loanId = _loanIdCounter++;

        loanRequests[loanId] = LoanRequest({
            tokenId: tokenId,
            borrower: msg.sender,
            lender: address(0),
            loanAmount: loanAmount,
            repaymentAmount: repaymentAmount,
            dueDate: invoice.dueDate,
            isActive: false,
            isRepaid: false
        });

        // Transfer NFT to contract
        invoiceNFT.transferFrom(msg.sender, address(this), tokenId);

        emit LoanRequestCreated(
            loanId,
            tokenId,
            msg.sender,
            loanAmount,
            repaymentAmount,
            invoice.dueDate
        );

        return loanId;
    }

    /**
     * @dev Lender funds a loan request
     * @param loanId The ID of the loan to fund
     */
    function fundLoan(uint256 loanId) external nonReentrant {
        LoanRequest storage loan = loanRequests[loanId];

        require(loan.borrower != address(0), "Loan does not exist");
        require(!loan.isActive, "Loan already funded");
        require(!loan.isRepaid, "Loan already repaid");
        require(loan.dueDate > block.timestamp, "Loan expired");
        require(lenderDeposits[msg.sender] >= loan.loanAmount, "Insufficient lender balance");

        loan.lender = msg.sender;
        loan.isActive = true;

        // Deduct from lender's deposit
        lenderDeposits[msg.sender] -= loan.loanAmount;

        // Transfer USDC to borrower
        usdcToken.safeTransfer(loan.borrower, loan.loanAmount);

        emit LoanFunded(loanId, msg.sender, loan.loanAmount);
    }

    /**
     * @dev Borrower repays the loan
     * @param loanId The ID of the loan to repay
     */
    function repayLoan(uint256 loanId) external nonReentrant {
        LoanRequest storage loan = loanRequests[loanId];

        require(loan.borrower == msg.sender, "Not the borrower");
        require(loan.isActive, "Loan not active");
        require(!loan.isRepaid, "Loan already repaid");

        loan.isRepaid = true;

        // Transfer repayment amount from borrower to lender
        usdcToken.safeTransferFrom(msg.sender, loan.lender, loan.repaymentAmount);

        // Return NFT to borrower
        invoiceNFT.transferFrom(address(this), msg.sender, loan.tokenId);

        // Increase borrower reputation
        borrowerReputation[msg.sender] += 1;

        emit LoanRepaid(loanId, msg.sender, loan.repaymentAmount);
    }

    /**
     * @dev Lender claims defaulted NFT if loan is past due and not repaid
     * @param loanId The ID of the defaulted loan
     */
    function claimDefaultedNFT(uint256 loanId) external nonReentrant {
        LoanRequest storage loan = loanRequests[loanId];

        require(loan.lender == msg.sender, "Not the lender");
        require(loan.isActive, "Loan not active");
        require(!loan.isRepaid, "Loan already repaid");
        require(block.timestamp > loan.dueDate, "Loan not yet defaulted");

        // Mark as repaid to prevent double claiming
        loan.isRepaid = true;

        // Transfer NFT to lender
        invoiceNFT.transferFrom(address(this), msg.sender, loan.tokenId);

        emit NFTClaimed(loanId, msg.sender, loan.tokenId);
    }

    /**
     * @dev Get loan request details
     * @param loanId The ID of the loan
     * @return The loan request struct
     */
    function getLoanRequest(uint256 loanId) external view returns (LoanRequest memory) {
        return loanRequests[loanId];
    }

    /**
     * @dev Get lender's available balance
     * @param lender The address of the lender
     * @return The available balance
     */
    function getLenderBalance(address lender) external view returns (uint256) {
        return lenderDeposits[lender];
    }

    /**
     * @dev Get borrower's reputation score
     * @param borrower The address of the borrower
     * @return The reputation score
     */
    function getBorrowerReputation(address borrower) external view returns (uint256) {
        return borrowerReputation[borrower];
    }
}
