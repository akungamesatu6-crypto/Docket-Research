// Docket Research — CREATE2 prediction ONLY. No mainnet transaction is
// sent by this script.
// Computes predicted addresses through the Arachnid deterministic proxy
// (0x4e59b44847b379578588920cA78FbF26c0B4956C), salt 0, in deploy order:
//   1) DocketToken(owner=BAW)
//   2) DocketFindings(owner=BAW)
//   3) DocketDesk(token, nft, BAW)   — needs the two predicted addresses
//   4) DocketMarketplace(nft, BAW)
// Writes <name>_inputdata.txt (salt 32 zero bytes + creation bytecode) for
// each contract and contracts/predictions.md with the 4 addresses, deploy
// order and post-deploy wiring steps.
// RE-RUN after EVERY source edit — any edit shifts the predictions.
// Run: npx hardhat run scripts/predict.js
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const OWNER = "0x36F3D56eAD5D1D6C2434F94DeFcEF732C5C3CbD2"; // BAW
const PROXY = "0x4e59b44847b379578588920cA78FbF26c0B4956C"; // Arachnid deterministic proxy
const PROXY_CREATION =
  "0x604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";

function predict(artifact, argTypes, argValues) {
  const args = ethers.AbiCoder.defaultAbiCoder().encode(argTypes, argValues);
  const creation = artifact.bytecode + args.slice(2);
  const predicted = ethers.getCreate2Address(PROXY, ethers.ZeroHash, ethers.keccak256(creation));
  return { creation, predicted };
}

async function estimateViaProxy(signer, inputData) {
  const proxyDeployTx = await signer.sendTransaction({ data: PROXY_CREATION });
  const proxyReceipt = await proxyDeployTx.wait();
  const localProxy = proxyReceipt.contractAddress;
  const gasViaProxy = await ethers.provider.estimateGas({ to: localProxy, data: inputData });
  return { localProxy, gasViaProxy };
}

async function main() {
  const [signer] = await ethers.getSigners();
  const gasPriceWei = 50_000_000n; // 0.05 gwei, as measured on BSC
  const outDir = path.join(__dirname, "..");
  const results = {};

  // 1) DocketToken — constructor(address owner)
  const tokenArtifact = await hre.artifacts.readArtifact("DocketToken");
  const token = predict(tokenArtifact, ["address"], [OWNER]);
  const tokenInput = ethers.concat([ethers.ZeroHash, token.creation]);
  const tokenEst = await estimateViaProxy(signer, tokenInput);
  fs.writeFileSync(path.join(outDir, "token_inputdata.txt"), ethers.hexlify(tokenInput));
  results.token = {
    predicted: token.predicted,
    gasViaProxy: tokenEst.gasViaProxy.toString(),
    costBnb: Number(tokenEst.gasViaProxy * gasPriceWei) / 1e18,
  };

  // 2) DocketFindings — constructor(address owner)
  const nftArtifact = await hre.artifacts.readArtifact("DocketFindings");
  const nft = predict(nftArtifact, ["address"], [OWNER]);
  const nftInput = ethers.concat([ethers.ZeroHash, nft.creation]);
  const nftEst = await estimateViaProxy(signer, nftInput);
  fs.writeFileSync(path.join(outDir, "nft_inputdata.txt"), ethers.hexlify(nftInput));
  results.nft = {
    predicted: nft.predicted,
    gasViaProxy: nftEst.gasViaProxy.toString(),
    costBnb: Number(nftEst.gasViaProxy * gasPriceWei) / 1e18,
  };

  // 3) DocketDesk — constructor(address token_, address nft_, address owner_)
  const deskArtifact = await hre.artifacts.readArtifact("DocketDesk");
  const desk = predict(deskArtifact, ["address", "address", "address"], [token.predicted, nft.predicted, OWNER]);
  const deskInput = ethers.concat([ethers.ZeroHash, desk.creation]);
  const deskEst = await estimateViaProxy(signer, deskInput);
  fs.writeFileSync(path.join(outDir, "desk_inputdata.txt"), ethers.hexlify(deskInput));
  results.desk = {
    predicted: desk.predicted,
    gasViaProxy: deskEst.gasViaProxy.toString(),
    costBnb: Number(deskEst.gasViaProxy * gasPriceWei) / 1e18,
  };

  // 4) DocketMarketplace — constructor(address nft_, address owner_)
  const marketArtifact = await hre.artifacts.readArtifact("DocketMarketplace");
  const market = predict(marketArtifact, ["address", "address"], [nft.predicted, OWNER]);
  const marketInput = ethers.concat([ethers.ZeroHash, market.creation]);
  const marketEst = await estimateViaProxy(signer, marketInput);
  fs.writeFileSync(path.join(outDir, "market_inputdata.txt"), ethers.hexlify(marketInput));
  results.market = {
    predicted: market.predicted,
    gasViaProxy: marketEst.gasViaProxy.toString(),
    costBnb: Number(marketEst.gasViaProxy * gasPriceWei) / 1e18,
  };

  results.proxy = PROXY;
  results.salt = ethers.ZeroHash;
  results.owner = OWNER;
  results.registry = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
  results.totalCostBnb =
    results.token.costBnb + results.nft.costBnb + results.desk.costBnb + results.market.costBnb;
  results.note =
    "PREDICTION ONLY — nothing deployed to mainnet. Gas estimated on local Hardhat network with identical proxy bytecode. Re-run after EVERY source edit; any edit shifts predictions.";

  const md = `# Docket Research — CREATE2 predictions

> Prediction only — nothing deployed to mainnet. Generated by \`npx hardhat run scripts/predict.js\`.
> Re-run after EVERY source edit; any edit shifts the predictions.

- Proxy: \`${PROXY}\` (Arachnid deterministic deployment proxy)
- Salt: \`0x0000000000000000000000000000000000000000000000000000000000000000\` (32 zero bytes)
- Owner / royalty receiver / revenue recipient: \`${OWNER}\` (BAW)
- SPACE ID Agent ID registry: \`${results.registry}\`

## Predicted addresses (deploy order)

| # | Contract | Predicted address |
|---|----------|-------------------|
| 1 | DocketToken ($DOCKET) | \`${results.token.predicted}\` |
| 2 | DocketFindings (FIND) | \`${results.nft.predicted}\` |
| 3 | DocketDesk | \`${results.desk.predicted}\` |
| 4 | DocketMarketplace | \`${results.market.predicted}\` |

Estimated deploy gas (local, via proxy): token ${results.token.gasViaProxy}, NFT ${results.nft.gasViaProxy}, Desk ${results.desk.gasViaProxy}, Market ${results.market.gasViaProxy}; total ~${results.totalCostBnb} BNB @ 0.05 gwei.

## Deploy order

1. Deploy \`DocketToken\` via the proxy with inputdata \`token_inputdata.txt\`.
2. Deploy \`DocketFindings\` via the proxy with inputdata \`nft_inputdata.txt\`.
3. Deploy \`DocketDesk\` via the proxy with inputdata \`desk_inputdata.txt\`.
4. Deploy \`DocketMarketplace\` via the proxy with inputdata \`market_inputdata.txt\`.

Each \`*_inputdata.txt\` is salt (32 zero bytes) + creation bytecode, sent as the
data of a transaction to the proxy.

## Post-deploy wiring (owner = BAW, in this order)

1. **Fund the Desk claim pool:** \`token.transfer(desk, 1_800_000_000 DOCKET)\` (1.8B, 18 decimals).
   The token constructor mints BOTH tranches (200M treasury + 1.8B pool) to the
   owner — this is deliberate, not a bug: the token cannot take the Desk
   address in its constructor because of a CREATE2 circular dependency (the
   Desk's creation code embeds the token address, so the token must deploy
   before the Desk exists). After this transfer the owner keeps 200M and the
   Desk holds 1.8B.
2. **Authorize the Desk to mint Findings:** \`nft.setMinter(desk, true)\`.
3. **Point the NFT at the Desk for live Class/Sealed metadata:** \`nft.setDesk(desk)\`.

No mint-open switch exists: filing opens automatically at deploy (GENESIS =
Desk deployment block) and cases roll every 3 hours from there.
`;

  fs.writeFileSync(path.join(outDir, "predictions.md"), md);

  console.log("DocketToken predicted:     ", results.token.predicted, "| gas:", results.token.gasViaProxy, "| cost:", results.token.costBnb, "BNB");
  console.log("DocketFindings predicted: ", results.nft.predicted, "| gas:", results.nft.gasViaProxy, "| cost:", results.nft.costBnb, "BNB");
  console.log("DocketDesk predicted:     ", results.desk.predicted, "| gas:", results.desk.gasViaProxy, "| cost:", results.desk.costBnb, "BNB");
  console.log("DocketMarket predicted:   ", results.market.predicted, "| gas:", results.market.gasViaProxy, "| cost:", results.market.costBnb, "BNB");
  console.log("Total est. cost @0.05 gwei:", results.totalCostBnb, "BNB");
  console.log("Files written: token/nft/desk/market *_inputdata.txt, predictions.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
