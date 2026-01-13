// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title InvoiceFinancing
 * @dev A smart contract for invoice financing on Mantle Network
 */
contract InvoiceFinancing is Ownable, ReentrancyGuard {
    struct Invoice {
        address supplier;
        address buyer;
        uint256 amount;
        uint256 dueDate;
        bool isPaid;
        bool isFinanced;
    }

    mapping(uint256 => Invoice) public invoices;
    uint256 public invoiceCounter;

    event InvoiceCreated(uint256 indexed invoiceId, address indexed supplier, address indexed buyer, uint256 amount);
    event InvoiceFinanced(uint256 indexed invoiceId, address indexed financier);
    event InvoicePaid(uint256 indexed invoiceId);

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Create a new invoice
     * @param _buyer The address of the buyer
     * @param _amount The invoice amount
     * @param _dueDate The due date timestamp
     */
    function createInvoice(
        address _buyer,
        uint256 _amount,
        uint256 _dueDate
    ) external returns (uint256) {
        require(_buyer != address(0), "Invalid buyer address");
        require(_amount > 0, "Amount must be greater than 0");
        require(_dueDate > block.timestamp, "Due date must be in the future");

        uint256 invoiceId = invoiceCounter++;
        invoices[invoiceId] = Invoice({
            supplier: msg.sender,
            buyer: _buyer,
            amount: _amount,
            dueDate: _dueDate,
            isPaid: false,
            isFinanced: false
        });

        emit InvoiceCreated(invoiceId, msg.sender, _buyer, _amount);
        return invoiceId;
    }

    /**
     * @dev Finance an invoice
     * @param _invoiceId The ID of the invoice to finance
     */
    function financeInvoice(uint256 _invoiceId) external payable nonReentrant {
        Invoice storage invoice = invoices[_invoiceId];
        require(invoice.amount > 0, "Invoice does not exist");
        require(!invoice.isFinanced, "Invoice already financed");
        require(!invoice.isPaid, "Invoice already paid");
        require(msg.value >= invoice.amount, "Insufficient payment");

        invoice.isFinanced = true;
        
        // Transfer funds to supplier
        (bool success, ) = invoice.supplier.call{value: invoice.amount}("");
        require(success, "Transfer failed");

        // Refund excess payment
        if (msg.value > invoice.amount) {
            (bool refundSuccess, ) = msg.sender.call{value: msg.value - invoice.amount}("");
            require(refundSuccess, "Refund failed");
        }

        emit InvoiceFinanced(_invoiceId, msg.sender);
    }

    /**
     * @dev Mark an invoice as paid
     * @param _invoiceId The ID of the invoice to mark as paid
     */
    function payInvoice(uint256 _invoiceId) external {
        Invoice storage invoice = invoices[_invoiceId];
        require(invoice.amount > 0, "Invoice does not exist");
        require(msg.sender == invoice.buyer, "Only buyer can pay");
        require(!invoice.isPaid, "Invoice already paid");

        invoice.isPaid = true;
        emit InvoicePaid(_invoiceId);
    }

    /**
     * @dev Get invoice details
     * @param _invoiceId The ID of the invoice
     */
    function getInvoice(uint256 _invoiceId) external view returns (Invoice memory) {
        return invoices[_invoiceId];
    }
}
