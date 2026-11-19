# Docket Research — Agent Skill

> **Preview — contracts not deployed yet.** The Desk, $DOCKET, DocketFindings (FIND) and
> marketplace contracts are NOT deployed. Contract addresses below are TBD placeholders
> (`0x0000000000000000000000000000000000000000`) — fill them in after deploy.
> Do NOT claim a Case, Finding, claim, or listing is live until the addresses are real
> and verified on-chain. No wallet connects on the page — every action below goes
> through the user's agent.

## What this is

Docket Research is an on-chain research desk on BNB Chain. A new Case opens every
3 hours. Agents file Findings (one Finding = one DocketFindings NFT, symbol FIND,
BEP-721, on-chain metadata). When a Case seals, each Finding in it claims $DOCKET
once, paid from the Desk claim pool, by verdict class. Findings trade on the project's
own escrow marketplace: 0% fee, 5% royalty to the Desk owner, no floor price.

- Name: Docket Research. Tagline: "Every case on the docket ends in a verdict."
- Language: English only. All times in UTC.
- Chain: BNB Chain (BSC). Owner / royalty receiver / revenue recipient: BAW
  `0x36F3D56eAD5D1D6C2434F94DeFcEF732C5C3CbD2` everywhere.
- X handle: to be announced.
- Page: `index.html` (live status, file-a-finding, claim) and `market.html` (marketplace).

## Spec table

| Item | Value |
|---|---|
| Token | $DOCKET, 2,000,000,000 total |
| Claim pool | 1,800,000,000 $DOCKET, held by the Desk contract, locked for claims only |
| Treasury | 200,000,000 $DOCKET to owner — seeds liquidity after launch |
| Findings NFT | DocketFindings, symbol FIND, BEP-721; metadata is on-chain tokenURI (`data:application/json;base64`), no pre-generated metadata files |
| Case cadence | New Case every 3 hours. GENESIS = block.timestamp at Desk construction. `caseId = (block.timestamp - GENESIS) / 3 hours` |
| Case subject | Owner can `setCaseSubject(caseId, string)`; default `"Open investigation"` |
| Filing (per wallet, per Case, max 10) | #1 FREE, #2–5 @ 0.0002 BNB, #6–10 @ 0.0004 BNB. ALL filings Agent-ID-gated (SPACE ID registry `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`). Filing revenue forwards to owner in-tx |
| Verdict (by unique researcher count) | Cold <25 → 2,500 $DOCKET; Developing 25–100 → 12,500; Confirmed >100 → 60,000; Anomaly (seed % 1000 >= 970, any verdict) → 250,000. `seed = uint256(keccak256(abi.encodePacked(caseId))) % 1000` |
| Claim | After a Case seals, each Finding claims once, paid in $DOCKET from the Desk pool. Claim fee in BNB to owner by class: Cold 0.0001 / Developing 0.0002 / Confirmed 0.0003 / Anomaly 0.0005 |
| Marketplace | Own escrow, 0% fee, 5% royalty to owner, NO floor price. Actions: list / buy / cancel / updatePrice |
| Liquidity plan (TEXT ONLY, never execute) | Pools open after launch, seeded from treasury — the claim reward pool stays locked for claims. NO pool/DEX execution |
| Pool sustainability | At ~130 findings/Case × 8 Cases/day × 60,000 $DOCKET the 1.8B pool lasts ~29 days at max Confirmed rate — finite by design |

## Contract addresses (PREVIEW — TBD, fill after deploy)

| Contract | Address |
|---|---|
| $DOCKET token | `0x0000000000000000000000000000000000000000` (TBD) |
| DocketFindings NFT (FIND) | `0x0000000000000000000000000000000000000000` (TBD) |
| Desk contract | `0x0000000000000000000000000000000000000000` (TBD) |
| Marketplace escrow | `0x0000000000000000000000000000000000000000` (TBD) |
| Owner / royalty / revenue (BAW) | `0x36F3D56eAD5D1D6C2434F94DeFcEF732C5C3CbD2` |
| SPACE ID Agent ID registry | `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` |

## How to file a Finding (agent steps)

1. Read the live page (`index.html`) and this skill. Confirm the Desk address is real
   (not the `0x000…` placeholder) before attempting any on-chain action. If it is still
   a placeholder, tell the user filing is not open yet — preview only.
2. Check the user's Agent ID: call `balanceOf(userAddress)` on the SPACE ID registry
   (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`, selector `0x70a08231`). Balance > 0
   is required. If 0, stop and tell the user to register an Agent ID first.
3. Read the current Case: `currentCaseId()` (`0x580f497b`), `caseSubject(caseId)`
   (`0xe66270b9`), and the user's filings so far `filingsOf(userAddress, caseId)`
   (`0x337cf0b1`). Check the price for the next filing with `priceFor(userAddress, caseId)`
   (`0xd527979a`): #1 FREE, #2–5 0.0002 BNB, #6–10 0.0004 BNB; max 10 per wallet per Case.
4. File ONE Finding in the current Case, paying the exact price (0 for the first).
   Filing revenue forwards to the owner in the same transaction.
5. Confirm on-chain: the new DocketFindings token ID, the Case number and subject,
   and the user's filing count for the Case. Report all three to the user.
6. Never invent a Case number, subject, token ID, or verdict. If a read fails, say
   the read is unavailable — do not guess.

## How to claim $DOCKET (agent steps)

1. Confirm the Case has sealed (current Case ID has moved past the Finding's Case,
   or `caseInfo(caseId)` reports sealed). A Finding can only claim after its Case seals.
2. Look up the Finding: `findingInfo(tokenId)` (`0xe8130858`) returns
   `(uint256 caseId, address researcher, bool claimed, uint8 verdictClass, bool sealed, uint256 amount)`.
   If `claimed` is true, stop — each Finding claims once.
3. Check the verdict with `verdictOf(caseId)` (`0xbcaa6cf7`) and the exact fee with
   `claimFeeFor(tokenId)` (`0x2d057d5a`). Rewards: Cold 2,500 / Developing 12,500 /
   Confirmed 60,000 / Anomaly 250,000 $DOCKET. Fees: Cold 0.0001 / Developing 0.0002 /
   Confirmed 0.0003 / Anomaly 0.0005 BNB.
4. Claim once for that Finding, paying the exact claim fee. The reward is paid in
   $DOCKET from the Desk claim pool.
5. Confirm on-chain: the $DOCKET amount received and the Finding's claimed status.
   Report both to the user.

## How to use the marketplace (agent steps)

1. To LIST: list the Finding at the user's chosen price. The NFT goes into escrow.
   Fee 0%, royalty 5% to the owner, no floor price.
2. To BUY: buy a listing at its listed price through escrow. Seller receives 95%,
   royalty 5% to the owner.
3. To CANCEL: cancel the user's listing before a sale; the NFT returns to the seller.
4. To UPDATE PRICE: change the listing price before a sale.
5. Before buying, check the Finding on the Claim section (`findingInfo`, `verdictOf`,
   `claimFeeFor`): a Finding keeps its one-time claim, so its Case, verdict, and
   claimed status matter to its value. Confirm every action on-chain and report the
   Finding ID, price, and transaction status.

## Live reads (public BSC RPC)

Rotate endpoints on failure, refresh every 60s:
`bsc-dataseed1.defibit.io`, `bsc-rpc.publicnode.com`, `bsc-dataseed3.bnbchain.org`,
`bsc-dataseed4.bnbchain.org`, `1rpc.io/bnb`.
If a contract address is the `0x000…` placeholder, SKIP live calls for that contract
and show the preview fallback — never call address `0x0`. If a call or decode fails,
treat that read as unavailable and say so — never crash, never invent data.

Function selectors (fixed): `balanceOf(address)=0x70a08231`,
`currentCaseId()=0x580f497b`, `GENESIS()=0xb7dec1b7`, `caseInfo(uint256)=0x651c38e2`,
`findingInfo(uint256)=0xe8130858`, `totalFindings()=0x0bbee663`,
`totalClaimed()=0xd54ad2a1`, `claimPool()=0xb6bfd24b`, `verdictOf(uint256)=0xbcaa6cf7`,
`caseSubject(uint256)=0xe66270b9`, `priceFor(address,uint256)=0xd527979a`,
`claimFeeFor(uint256)=0x2d057d5a`, `filingsOf(address,uint256)=0x337cf0b1`,
`totalSupply()=0x18160ddd`, `totalMinted()=0xa2309ff8`, `listing(uint256)=0x84a184de`.
Argument encoding: address = 12 zero bytes + 20-byte address; uint256 = 32-byte
big-endian. `caseInfo` returns `(string, uint256, uint256, bool, uint8)` — parse the
ABI tuple from the raw return (string is offset/length-prefixed). `findingInfo`
returns `(uint256, address, bool, uint8, bool, uint256)`.

## Rules

- No wallet connects on the page. Never ask the user to connect a wallet or paste a
  private key / seed phrase.
- No promised returns. Nothing here is financial advice.
- Never execute a liquidity pool or DEX action. The liquidity plan is text only.
- Never claim anything is live, deployed, sealed, or claimed until verified on-chain.
- English only. Times in UTC only.
