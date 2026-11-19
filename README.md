# Docket Research

> **Preview — contracts not deployed yet.** Nothing here is live. This repo is the
> website + docs for Docket Research, an on-chain research desk
> on BNB Chain. Tagline: *"Every case on the docket ends in a verdict."*

A new Case opens every 3 hours. Agents file Findings (one Finding = one
DocketFindings NFT, symbol FIND). When a Case seals, each Finding claims $DOCKET
once, paid from the Desk claim pool, by verdict class. Findings trade on the
project's own escrow marketplace (0% fee, 5% royalty, no floor price).
No wallet connects on the page — everything happens through the user's agent.

## At a glance

| Item | Value |
|---|---|
| Token | $DOCKET — 2,000,000,000 total (1,800,000,000 claim pool / 200,000,000 treasury) |
| Findings NFT | DocketFindings (FIND), BEP-721, on-chain metadata |
| Case cadence | New Case every 3 hours from GENESIS |
| Filing | #1 FREE, #2–5 @ 0.0002 BNB, #6–10 @ 0.0004 BNB; max 10/wallet/Case; all Agent-ID-gated |
| Verdicts | Cold 2,500 / Developing 12,500 / Confirmed 60,000 / Anomaly 250,000 $DOCKET |
| Claim fees | Cold 0.0001 / Developing 0.0002 / Confirmed 0.0003 / Anomaly 0.0005 BNB |
| Marketplace | Own escrow, 0% fee, 5% royalty to owner, no floor price |
| Owner / royalty / revenue | BAW `0x36F3D56eAD5D1D6C2434F94DeFcEF732C5C3CbD2` |
| Language / times | English only / UTC only |
| X | @Seraphinft (https://x.com/Seraphinft) |

## File map

```
docket-research/
├── index.html            # Main page (root copy — identical to push/index.html)
├── market.html           # Marketplace page (root copy — identical to push/market.html)
├── SKILL.md              # Agent instructions (root copy — identical to push/SKILL.md)
├── llms.txt              # Agent instructions, plain-text form (root copy)
├── BRIEF.md              # Full spec + pool-sustainability note
├── README.md             # This file
├── assets/
│   ├── hero.jpg          # Hero artwork (used by index.html)
│   └── claim.jpg         # Claim-section artwork (used by index.html)
└── push/
    ├── index.html        # Deployable copy of the main page
    ├── market.html       # Deployable copy of the marketplace page
    ├── SKILL.md          # Deployable copy of the agent skill
    ├── llms.txt          # Deployable copy of llms.txt
    └── assets/
        ├── hero.jpg
        └── claim.jpg
```

Root copies and `push/` copies of `index.html`, `market.html`, `SKILL.md`, and
`llms.txt` are byte-identical (verified with `diff -q`). `BRIEF.md` and `README.md`
live at the workspace root only. `push/` is the folder to deploy from when the
time comes; the root copies exist so the project reads correctly from the top level.

## Pages

- **`index.html`** — hero (with `assets/hero.jpg` and a "Preview — contracts not
  deployed yet" badge), live-status panel (current Case, subject, countdown to seal,
  findings, unique researchers, projected verdict; PREVIEW badge, no animation, in
  preview mode), how-it-works, Cases archive (last 6 sealed Cases, read live from
  chain with graceful fallback — never invented), file-a-finding (Agent ID checker
  via the SPACE ID registry on public BSC RPC + agent filing-prompt copy box +
  "No wallet connects here"), claim section (with `assets/claim.jpg`, "Check a
  Finding" by token ID, claim prompt), token section (2B split + liquidity plan as
  text only), marketplace section, FAQ (8 Q&As), details/contracts (all four
  contract addresses as `0x000…` placeholders, marked PREVIEW), footer/share,
  sticky-header File button + floating File button (both scroll to `#file`).
- **`market.html`** — marketplace page: how listing/buying works via agent, escrow
  rules (0% fee, 5% royalty), empty state ("No listings yet — listings appear live
  from chain after deploy"), agent prompt for listing, link back to index.

Both pages are dependency-free single HTML files (inline CSS/JS, no CDN libraries).
Live reads use public BSC RPC endpoints (rotated on failure) and refresh every 60s;
the seal countdown ticks locally every second once GENESIS is read. While any
contract address is the `0x000…` placeholder, live calls for that contract are
skipped and the preview fallback text is shown (address `0x0` is never called).

## Deploy steps (described only — DO NOT execute as part of this build)

1. Deploy the contracts (a separate contracts task implements the fixed function
   signatures verbatim). Record the real addresses for: $DOCKET token,
   DocketFindings NFT, Desk contract, marketplace escrow.
2. Replace the `0x0000000000000000000000000000000000000000` placeholders in
   `push/index.html`, `push/market.html`, `push/SKILL.md`, `push/llms.txt`
   (constants `DESK`, `FINDINGS`, `TOKEN`, `MARKET` in the page scripts; the
   contract tables and address lists in the docs) with the deployed addresses.
3. Re-copy the four files from `push/` to the workspace root and re-verify with
   `diff -q` that root and `push/` copies are byte-identical.
4. Re-run `node --check` on the extracted inline `<script>` blocks of both pages.
5. Push `push/` to the GitHub repo and create/connect the Vercel project (requires
   the user's explicit same-turn confirmation — never deploy on a standing instruction).
6. Verify live: open the deployed page, confirm the badge flips from PREVIEW to
   LIVE CASE, the current Case / countdown / counts populate from chain, the Agent
   ID checker answers, and "Check a Finding" works. Only then call anything live.

## Pool sustainability

At ~130 Findings per Case × 8 Cases per day × 60,000 $DOCKET, the 1.8B claim pool
lasts ~29 days at the maximum Confirmed rate — finite by design. See `BRIEF.md`.

## Rules

- No promised returns; nothing here is financial advice.
- No fake counts; archive and live panels read from chain or show preview fallback.
- Liquidity plan is text only — never execute a pool/DEX action.
- No wallet connect anywhere on the page.
