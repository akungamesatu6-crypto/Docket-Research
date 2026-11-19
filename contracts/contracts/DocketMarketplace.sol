// SPDX-License-Identifier: MIT
// Docket Research — own escrow marketplace for DocketFindings (FIND).
// 0% marketplace fee, 5% royalty to the owner on every sale.
// NO floor price. Exact payment only: msg.value must equal the listing
// price. Listing is deleted before the NFT transfer and the payouts, so a
// re-entrant buy cannot double-spend.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC721Minimal {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

contract DocketMarketplace is Ownable, ReentrancyGuard {
    IERC721Minimal public immutable NFT;

    uint256 public constant ROYALTY_BPS = 500; // 5%

    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }
    mapping(uint256 => Listing) public listings;

    error NotTokenOwner();
    error NotSeller();
    error NotActive();
    error InvalidPrice();
    error NotApproved();
    error WrongValue(uint256 expected);

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed tokenId, address indexed seller);
    event PriceUpdated(uint256 indexed tokenId, uint256 price);
    event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);

    constructor(address nft_, address owner_) Ownable(owner_) {
        NFT = IERC721Minimal(nft_);
    }

    function list(uint256 tokenId, uint256 price) external {
        if (NFT.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (price == 0) revert InvalidPrice();
        if (
            NFT.getApproved(tokenId) != address(this) &&
            !NFT.isApprovedForAll(msg.sender, address(this))
        ) revert NotApproved();
        listings[tokenId] = Listing({seller: msg.sender, price: price, active: true});
        emit Listed(tokenId, msg.sender, price);
    }

    function cancel(uint256 tokenId) external {
        Listing storage l = listings[tokenId];
        if (!l.active) revert NotActive();
        if (l.seller != msg.sender) revert NotSeller();
        delete listings[tokenId];
        emit Cancelled(tokenId, msg.sender);
    }

    function updatePrice(uint256 tokenId, uint256 price) external {
        Listing storage l = listings[tokenId];
        if (!l.active) revert NotActive();
        if (l.seller != msg.sender) revert NotSeller();
        if (price == 0) revert InvalidPrice();
        l.price = price;
        emit PriceUpdated(tokenId, price);
    }

    function buy(uint256 tokenId) external payable nonReentrant {
        Listing memory l = listings[tokenId];
        if (!l.active) revert NotActive();
        if (msg.value != l.price) revert WrongValue(l.price);

        uint256 royalty = (l.price * ROYALTY_BPS) / 10000;
        uint256 sellerProceeds = l.price - royalty;

        delete listings[tokenId];
        NFT.safeTransferFrom(l.seller, msg.sender, tokenId);

        (bool okSeller, ) = l.seller.call{value: sellerProceeds}("");
        require(okSeller, "seller payout failed");
        if (royalty > 0) {
            (bool okRoyalty, ) = owner().call{value: royalty}("");
            require(okRoyalty, "royalty payout failed");
        }

        emit Sold(tokenId, l.seller, msg.sender, l.price);
    }

    function listing(uint256 tokenId)
        external
        view
        returns (address seller, uint256 price, bool active)
    {
        Listing memory l = listings[tokenId];
        return (l.seller, l.price, l.active);
    }
}
