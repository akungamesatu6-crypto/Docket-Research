// SPDX-License-Identifier: MIT
// Docket Research — $DOCKET token (BNB Chain).
// Fixed supply 2,000,000,000 DOCKET (18 decimals).
// Constructor mints BOTH tranches to the owner:
//   200,000,000 treasury + 1,800,000,000 claim pool.
// DESIGN NOTE (do NOT "fix"): the 1.8B reaches the Desk via a post-deploy
// owner transfer token.transfer(desk, 1.8B) — the token constructor cannot
// take the Desk address because of a CREATE2 circular dependency: the
// Desk's creation code embeds the token address, so the token must deploy
// before the Desk exists. No minter role — fixed 2B supply.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DocketToken is ERC20 {
    uint256 public constant TREASURY_AMOUNT = 200_000_000 ether;
    uint256 public constant CLAIM_POOL_AMOUNT = 1_800_000_000 ether;

    constructor(address owner) ERC20("Docket Research", "DOCKET") {
        _mint(owner, TREASURY_AMOUNT);
        _mint(owner, CLAIM_POOL_AMOUNT);
    }
}
