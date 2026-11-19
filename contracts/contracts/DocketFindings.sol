// SPDX-License-Identifier: MIT
// Docket Research — DocketFindings (FIND), the research-Finding NFT.
// ERC721 + ERC-2981 (5% royalty to owner). Sequential tokenIds from 1.
// Only the Desk (set as minter by the owner) may mint. The Desk address is
// wired post-deploy via setDesk — see predictions.md.
// tokenURI is fully on-chain data-URI JSON (no image field): name,
// description, and attributes Case / Researcher / Class / Sealed. Class and
// Sealed are read live from the Desk; before the Desk is set they read
// "Unsealed" / false.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IDocketDeskView {
    function verdictOf(uint256 caseId) external view returns (uint8);
    function isSealed(uint256 caseId) external view returns (bool);
}

contract DocketFindings is ERC721, ERC2981, Ownable {
    using Strings for uint256;

    address public desk;
    mapping(address => bool) public minters;
    mapping(uint256 => uint256) public findingCase;
    mapping(uint256 => address) public findingResearcher;

    uint256 public nextId = 1;
    uint256 public totalMinted;

    event MinterSet(address indexed minter, bool allowed);
    event DeskSet(address indexed desk);

    error NotMinter();

    constructor(address owner) ERC721("DocketFindings", "FIND") Ownable(owner) {
        _setDefaultRoyalty(owner, 500); // 5%
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        minters[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    function setDesk(address desk_) external onlyOwner {
        desk = desk_;
        emit DeskSet(desk_);
    }

    function mint(address to, uint256 caseId) external returns (uint256) {
        if (!minters[msg.sender]) revert NotMinter();
        uint256 tokenId = nextId++;
        findingCase[tokenId] = caseId;
        findingResearcher[tokenId] = to;
        totalMinted++;
        _safeMint(to, tokenId);
        return tokenId;
    }

    function className(uint8 classId) public pure returns (string memory) {
        if (classId == 0) return "Cold";
        if (classId == 1) return "Developing";
        if (classId == 2) return "Confirmed";
        return "Anomaly";
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        uint256 caseId = findingCase[tokenId];
        address researcher = findingResearcher[tokenId];

        string memory classStr = "Unsealed";
        string memory sealedStr = "false";
        if (desk != address(0)) {
            classStr = className(IDocketDeskView(desk).verdictOf(caseId));
            sealedStr = IDocketDeskView(desk).isSealed(caseId) ? "true" : "false";
        }

        string memory json = string.concat(
            '{"name":"Docket Finding #',
            tokenId.toString(),
            '","description":"A research Finding filed on the Docket Research desk. Claimable in $DOCKET once its case seals.","attributes":[',
            '{"trait_type":"Case","value":',
            caseId.toString(),
            '},{"trait_type":"Researcher","value":"',
            Strings.toHexString(researcher),
            '"},{"trait_type":"Class","value":"',
            classStr,
            '"},{"trait_type":"Sealed","value":',
            sealedStr,
            "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
