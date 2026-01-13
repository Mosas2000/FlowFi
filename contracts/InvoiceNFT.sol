// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title InvoiceNFT
 * @dev NFT representation of invoices for the FlowFi platform
 */
contract InvoiceNFT is ERC721, ERC721URIStorage, Ownable {
    struct InvoiceDetails {
        uint256 invoiceAmount;
        uint256 dueDate;
        string debtor;
        bytes32 invoiceHash;
        address borrower;
    }

    mapping(uint256 => InvoiceDetails) private _invoiceDetails;
    uint256 private _tokenIdCounter;

    event InvoiceMinted(
        uint256 indexed tokenId,
        address indexed borrower,
        uint256 invoiceAmount,
        uint256 dueDate,
        string debtor
    );

    constructor() ERC721("FlowFi Invoice", "FFINV") Ownable(msg.sender) {}

    /**
     * @dev Mints a new invoice NFT
     * @param amount The invoice amount
     * @param dueDate The due date timestamp
     * @param debtor The debtor name/identifier
     * @param invoiceHash The hash of the invoice document
     * @return tokenId The ID of the newly minted NFT
     */
    function mintInvoice(
        uint256 amount,
        uint256 dueDate,
        string memory debtor,
        bytes32 invoiceHash
    ) external returns (uint256) {
        require(amount > 0, "Invoice amount must be greater than 0");
        require(dueDate > block.timestamp, "Due date must be in the future");
        require(bytes(debtor).length > 0, "Debtor cannot be empty");
        require(invoiceHash != bytes32(0), "Invoice hash cannot be empty");

        uint256 tokenId = _tokenIdCounter++;
        
        _safeMint(msg.sender, tokenId);
        
        _invoiceDetails[tokenId] = InvoiceDetails({
            invoiceAmount: amount,
            dueDate: dueDate,
            debtor: debtor,
            invoiceHash: invoiceHash,
            borrower: msg.sender
        });

        emit InvoiceMinted(tokenId, msg.sender, amount, dueDate, debtor);
        
        return tokenId;
    }

    /**
     * @dev Returns the invoice details for a given token ID
     * @param tokenId The token ID to query
     * @return The invoice details struct
     */
    function getInvoiceDetails(uint256 tokenId) external view returns (InvoiceDetails memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _invoiceDetails[tokenId];
    }

    /**
     * @dev Override to restrict transfers to only borrower or contract owner
     * Also allows the current NFT holder to transfer (e.g., LendingPool returning NFT)
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from == address(0))
        if (from != address(0)) {
            // Contract owner can always transfer
            if (msg.sender != owner()) {
                // For non-owner transfers, check if:
                // 1. The authorized caller is the borrower, OR
                // 2. The current owner (from) is the borrower (borrower initiating transfer), OR
                // 3. The current owner (from) is transferring (e.g., LendingPool returning NFT)
                require(
                    auth == _invoiceDetails[tokenId].borrower || 
                    from == _invoiceDetails[tokenId].borrower ||
                    auth == from,
                    "Only borrower or contract owner can transfer"
                );
            }
        }
        
        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Override required by Solidity for ERC721URIStorage
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    /**
     * @dev Override required by Solidity for ERC721URIStorage
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
