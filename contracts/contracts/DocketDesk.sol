// SPDX-License-Identifier: MIT
// Docket Research — the on-chain research desk (BNB Chain).
// A new Case opens every 3 hours from GENESIS (block.timestamp at
// construction). caseId = (block.timestamp - GENESIS) / 3 hours.
// Filing: Agent-ID-gated (SPACE ID registry) + EOA-only, max 10 filings
// per wallet per case: #1 FREE, #2-5 @ 0.0002 BNB, #6-10 @ 0.0004 BNB.
// Filing revenue forwards to the owner in-tx. Each filing mints one FIND.
// Verdict (when the case window ends) by unique researcher count:
//   Cold <25 -> 2,500 DOCKET; Developing 25-100 -> 12,500;
//   Confirmed >100 -> 60,000; Anomaly (seed % 1000 >= 970, any verdict)
//   -> 250,000. seed = uint256(keccak256(abi.encodePacked(caseId))) % 1000.
// Claim: after a case seals, each Finding claims once in $DOCKET from the
// Desk pool, paying a BNB claim fee to the owner by class
// (Cold 0.0001 / Developing 0.0002 / Confirmed 0.0003 / Anomaly 0.0005).
// Claim has NO Agent ID gate by design, so a Finding bought on the
// marketplace can still be claimed by its holder.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IDocketFindingsMint {
    function mint(address to, uint256 caseId) external returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IAgentRegistry {
    function balanceOf(address account) external view returns (uint256);
}

contract DocketDesk is Ownable, ReentrancyGuard {
    IERC20Minimal public immutable TOKEN;
    IDocketFindingsMint public immutable NFT;
    IAgentRegistry public immutable REGISTRY;

    uint256 public immutable GENESIS;

    uint256 public constant CASE_DURATION = 3 hours;
    uint256 public constant MAX_PER_WALLET_PER_CASE = 10;
    uint256 public constant PRICE_2_5 = 0.0002 ether;
    uint256 public constant PRICE_6_10 = 0.0004 ether;

    uint256 public constant PAY_COLD = 2500 ether;
    uint256 public constant PAY_DEV = 12500 ether;
    uint256 public constant PAY_CONF = 60000 ether;
    uint256 public constant PAY_ANOM = 250000 ether;

    uint256 public constant FEE_COLD = 0.0001 ether;
    uint256 public constant FEE_DEV = 0.0002 ether;
    uint256 public constant FEE_CONF = 0.0003 ether;
    uint256 public constant FEE_ANOM = 0.0005 ether;

    // Verdict classes: 0 Cold, 1 Developing, 2 Confirmed, 3 Anomaly.
    uint256 public constant ANOMALY_THRESHOLD = 970;

    mapping(uint256 => uint256) public researcherCount;
    mapping(uint256 => uint256) public findingsInCase;
    mapping(address => mapping(uint256 => uint256)) public filingsOf;
    mapping(uint256 => string) private _caseSubjects;

    struct Finding {
        uint256 caseId;
        address researcher;
        bool claimed;
    }
    mapping(uint256 => Finding) public findings;

    uint256 public totalClaimed;
    uint256 public totalFindings;

    error NotEOA();
    error NotAgent();
    error OverLimit();
    error WrongCase();
    error WrongValue(uint256 expected);
    error UnknownFinding();
    error AlreadyClaimed();
    error CaseNotSealed();
    error NotFindingOwner();
    error InsufficientPool();

    event FindingFiled(
        uint256 indexed tokenId, uint256 indexed caseId, address indexed researcher, uint256 price
    );
    event FindingClaimed(
        uint256 indexed tokenId, uint256 indexed caseId, address indexed claimer, uint256 payout, uint256 fee
    );
    event CaseSubjectSet(uint256 indexed caseId, string subject);

    constructor(address token_, address nft_, address owner_) Ownable(owner_) {
        TOKEN = IERC20Minimal(token_);
        NFT = IDocketFindingsMint(nft_);
        // SPACE ID Agent ID registry.
        REGISTRY = IAgentRegistry(0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F);
        GENESIS = block.timestamp;
    }

    function currentCaseId() public view returns (uint256) {
        return (block.timestamp - GENESIS) / CASE_DURATION;
    }

    function isSealed(uint256 caseId) public view returns (bool) {
        return block.timestamp >= GENESIS + (caseId + 1) * CASE_DURATION;
    }

    function seedOf(uint256 caseId) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(caseId))) % 1000;
    }

    function verdictOf(uint256 caseId) public view returns (uint8) {
        if (seedOf(caseId) >= ANOMALY_THRESHOLD) return 3; // Anomaly, any researcher count
        uint256 researchers = researcherCount[caseId];
        if (researchers < 25) return 0; // Cold
        if (researchers <= 100) return 1; // Developing
        return 2; // Confirmed
    }

    function caseSubject(uint256 caseId) public view returns (string memory) {
        string memory subject = _caseSubjects[caseId];
        if (bytes(subject).length == 0) return "Open investigation";
        return subject;
    }

    function setCaseSubject(uint256 caseId, string calldata subject) external onlyOwner {
        _caseSubjects[caseId] = subject;
        emit CaseSubjectSet(caseId, subject);
    }

    function priceFor(address wallet, uint256 caseId) public view returns (uint256) {
        uint256 filings = filingsOf[wallet][caseId];
        if (filings >= MAX_PER_WALLET_PER_CASE) revert OverLimit();
        if (filings == 0) return 0;
        if (filings <= 4) return PRICE_2_5;
        return PRICE_6_10;
    }

    function fileFinding(uint256 caseId) external payable nonReentrant {
        if (caseId != currentCaseId()) revert WrongCase();
        if (msg.sender != tx.origin) revert NotEOA();
        if (REGISTRY.balanceOf(msg.sender) == 0) revert NotAgent();
        if (filingsOf[msg.sender][caseId] >= MAX_PER_WALLET_PER_CASE) revert OverLimit();
        uint256 price = priceFor(msg.sender, caseId);
        if (msg.value != price) revert WrongValue(price);

        if (filingsOf[msg.sender][caseId] == 0) {
            researcherCount[caseId]++;
        }
        filingsOf[msg.sender][caseId]++;
        findingsInCase[caseId]++;
        totalFindings++;

        uint256 tokenId = NFT.mint(msg.sender, caseId);
        findings[tokenId] = Finding({caseId: caseId, researcher: msg.sender, claimed: false});

        if (price > 0) {
            (bool ok, ) = owner().call{value: price}("");
            require(ok, "revenue forward failed");
        }

        emit FindingFiled(tokenId, caseId, msg.sender, price);
    }

    function payoutFor(uint8 classId) public pure returns (uint256) {
        if (classId == 0) return PAY_COLD;
        if (classId == 1) return PAY_DEV;
        if (classId == 2) return PAY_CONF;
        return PAY_ANOM;
    }

    function feeFor(uint8 classId) public pure returns (uint256) {
        if (classId == 0) return FEE_COLD;
        if (classId == 1) return FEE_DEV;
        if (classId == 2) return FEE_CONF;
        return FEE_ANOM;
    }

    function claimFeeFor(uint256 tokenId) public view returns (uint256) {
        Finding memory f = findings[tokenId];
        if (f.researcher == address(0)) revert UnknownFinding();
        return feeFor(verdictOf(f.caseId));
    }

    function claim(uint256 tokenId) external payable nonReentrant {
        Finding storage f = findings[tokenId];
        if (f.researcher == address(0)) revert UnknownFinding();
        if (f.claimed) revert AlreadyClaimed();
        if (!isSealed(f.caseId)) revert CaseNotSealed();
        if (msg.sender != NFT.ownerOf(tokenId)) revert NotFindingOwner();
        // NOTE: no Agent ID gate on claim by design — a Finding bought on
        // the marketplace must still be claimable by its holder.
        if (msg.sender != tx.origin) revert NotEOA();
        uint256 fee = feeFor(verdictOf(f.caseId));
        if (msg.value != fee) revert WrongValue(fee);
        uint256 payout = payoutFor(verdictOf(f.caseId));
        if (TOKEN.balanceOf(address(this)) < payout) revert InsufficientPool();

        f.claimed = true;
        totalClaimed++;

        require(TOKEN.transfer(msg.sender, payout), "payout failed");
        if (fee > 0) {
            (bool ok, ) = owner().call{value: fee}("");
            require(ok, "fee forward failed");
        }

        emit FindingClaimed(tokenId, f.caseId, msg.sender, payout, fee);
    }

    function caseInfo(uint256 caseId)
        external
        view
        returns (string memory subject, uint256 researchers, uint256 findingsCount, bool sealedCase, uint8 verdict)
    {
        return (
            caseSubject(caseId),
            researcherCount[caseId],
            findingsInCase[caseId],
            isSealed(caseId),
            verdictOf(caseId)
        );
    }

    function findingInfo(uint256 tokenId)
        external
        view
        returns (uint256 caseId, address researcher, bool claimed, uint8 classId, bool claimable, uint256 fee)
    {
        Finding memory f = findings[tokenId];
        if (f.researcher == address(0)) revert UnknownFinding();
        uint8 v = verdictOf(f.caseId);
        return (f.caseId, f.researcher, f.claimed, v, isSealed(f.caseId) && !f.claimed, feeFor(v));
    }

    function claimPool() external view returns (uint256) {
        return TOKEN.balanceOf(address(this));
    }
}
