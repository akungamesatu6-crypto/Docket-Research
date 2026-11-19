// Docket Research — full test suite (local Hardhat network only).
// The Desk hardcodes the real SPACE ID Agent ID registry address
// (0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F), which holds no code on the
// local network — so each test deploys MockAgentRegistry and places its
// bytecode at the real registry address via `hardhat_setCode`, then funds
// wallets through setBalance. Tests use the deployer as owner (not BAW);
// predictions (scripts/predict.js) use BAW.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const REGISTRY = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
const CASE = 3 * 60 * 60; // 3 hours in seconds
const P2 = ethers.parseEther("0.0002");
const P4 = ethers.parseEther("0.0004");

// seed = uint256(keccak256(abi.encodePacked(caseId))) % 1000
function seedOf(caseId) {
  return Number(BigInt(ethers.solidityPackedKeccak256(["uint256"], [caseId])) % 1000n);
}
function firstCaseWith(pred, from = 0) {
  for (let i = from; ; i++) if (pred(seedOf(i))) return i;
}

async function deployAll() {
  const [owner] = await ethers.getSigners();

  // Mock registry code at the REAL registry address.
  const MockRegistry = await ethers.getContractFactory("MockAgentRegistry");
  const mockDeployed = await MockRegistry.deploy();
  const mockCode = await ethers.provider.getCode(await mockDeployed.getAddress());
  await network.provider.send("hardhat_setCode", [REGISTRY, mockCode]);
  const registry = await ethers.getContractAt("MockAgentRegistry", REGISTRY);
  await registry.setBalance(owner.address, 1);

  const Token = await ethers.getContractFactory("DocketToken");
  const token = await Token.deploy(owner.address);
  const Nft = await ethers.getContractFactory("DocketFindings");
  const nft = await Nft.deploy(owner.address);
  const Desk = await ethers.getContractFactory("DocketDesk");
  const desk = await Desk.deploy(
    await token.getAddress(),
    await nft.getAddress(),
    owner.address
  );
  const Market = await ethers.getContractFactory("DocketMarketplace");
  const market = await Market.deploy(await nft.getAddress(), owner.address);

  // Post-deploy wiring (same steps as predictions.md).
  await token.transfer(await desk.getAddress(), ethers.parseEther("1800000000"));
  await nft.setMinter(await desk.getAddress(), true);
  await nft.setDesk(await desk.getAddress());

  const genesis = Number(await desk.GENESIS());
  return { owner, registry, token, nft, desk, market, genesis };
}

// Fresh random wallet, funded with BNB and given an Agent ID balance.
async function makeAgent(owner, registry, fundEth = "0.05") {
  const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
  await owner.sendTransaction({ to: wallet.address, value: ethers.parseEther(fundEth) });
  await registry.setBalance(wallet.address, 1);
  return wallet;
}

async function fileOnce(desk, wallet, caseId, value = 0n) {
  return desk.connect(wallet).fileFinding(caseId, { value });
}

function decodeTokenURI(uri) {
  const prefix = "data:application/json;base64,";
  expect(uri.startsWith(prefix)).to.equal(true);
  return JSON.parse(Buffer.from(uri.slice(prefix.length), "base64").toString("utf8"));
}

describe("Docket Research", function () {
  describe("Token split", function () {
    it("totalSupply 2B; owner holds 200M + 1.8B at construction; after transfer Desk=1.8B, owner=200M", async function () {
      const [owner] = await ethers.getSigners();
      const Token = await ethers.getContractFactory("DocketToken");
      const token = await Token.deploy(owner.address);
      expect(await token.totalSupply()).to.equal(ethers.parseEther("2000000000"));
      expect(await token.balanceOf(owner.address)).to.equal(ethers.parseEther("2000000000"));
      expect(await token.name()).to.equal("Docket Research");
      expect(await token.symbol()).to.equal("DOCKET");

      const Nft = await ethers.getContractFactory("DocketFindings");
      const nft = await Nft.deploy(owner.address);
      const Desk = await ethers.getContractFactory("DocketDesk");
      const desk = await Desk.deploy(await token.getAddress(), await nft.getAddress(), owner.address);
      await token.transfer(await desk.getAddress(), ethers.parseEther("1800000000"));
      expect(await token.balanceOf(await desk.getAddress())).to.equal(ethers.parseEther("1800000000"));
      expect(await token.balanceOf(owner.address)).to.equal(ethers.parseEther("200000000"));
      expect(await desk.claimPool()).to.equal(ethers.parseEther("1800000000"));
    });
  });

  describe("Filing ladder", function () {
    it("#1 free, #2-5 @ 0.0002, #6-10 @ 0.0004; 11th reverts OverLimit; wrong value reverts WrongValue; priceFor matches; revenue forwards to owner", async function () {
      const { owner, registry, desk } = await deployAll();
      const agent = await makeAgent(owner, registry);
      const agent2 = await makeAgent(owner, registry);
      const caseId = await desk.currentCaseId();

      const ownerBefore = await ethers.provider.getBalance(owner.address);

      expect(await desk.priceFor(agent.address, caseId)).to.equal(0);
      await expect(fileOnce(desk, agent, caseId, 0)).to.emit(desk, "FindingFiled");
      expect(await desk.filingsOf(agent.address, caseId)).to.equal(1);
      expect(await desk.researcherCount(caseId)).to.equal(1);
      expect(await desk.findingsInCase(caseId)).to.equal(1);
      expect(await desk.priceFor(agent.address, caseId)).to.equal(P2);

      // Wrong value on a paid filing.
      await expect(fileOnce(desk, agent, caseId, ethers.parseEther("0.0001")))
        .to.be.revertedWithCustomError(desk, "WrongValue")
        .withArgs(P2);
      await expect(fileOnce(desk, agent, caseId, ethers.parseEther("0.0003")))
        .to.be.revertedWithCustomError(desk, "WrongValue")
        .withArgs(P2);

      for (let i = 2; i <= 5; i++) {
        await fileOnce(desk, agent, caseId, P2);
        expect(await desk.filingsOf(agent.address, caseId)).to.equal(i);
      }
      expect(await desk.priceFor(agent.address, caseId)).to.equal(P4);
      for (let i = 6; i <= 10; i++) {
        await fileOnce(desk, agent, caseId, P4);
        expect(await desk.filingsOf(agent.address, caseId)).to.equal(i);
      }
      // A second wallet's first filing is still free and counts a new researcher.
      await fileOnce(desk, agent2, caseId, 0);
      expect(await desk.researcherCount(caseId)).to.equal(2);

      await expect(desk.priceFor(agent.address, caseId)).to.be.revertedWithCustomError(desk, "OverLimit");
      await expect(fileOnce(desk, agent, caseId, P4)).to.be.revertedWithCustomError(desk, "OverLimit");

      // Revenue: 4 x 0.0002 + 5 x 0.0004 = 0.0028 BNB forwarded to owner in-tx.
      const ownerAfter = await ethers.provider.getBalance(owner.address);
      expect(ownerAfter - ownerBefore).to.equal(ethers.parseEther("0.0028"));
    });

    it("max 10/case is per case: after warp to the next case the same wallet can file 10 more", async function () {
      const { owner, registry, desk, genesis } = await deployAll();
      const agent = await makeAgent(owner, registry);
      const case0 = await desk.currentCaseId();
      for (let i = 0; i < 10; i++) {
        await fileOnce(desk, agent, case0, i === 0 ? 0 : i <= 4 ? P2 : P4);
      }
      await expect(fileOnce(desk, agent, case0, P4)).to.be.revertedWithCustomError(desk, "OverLimit");

      await time.increaseTo(genesis + CASE + 60);
      const case1 = await desk.currentCaseId();
      expect(case1).to.equal(case0 + 1n);
      expect(await desk.priceFor(agent.address, case1)).to.equal(0);
      await fileOnce(desk, agent, case1, 0);
      for (let i = 2; i <= 10; i++) {
        await fileOnce(desk, agent, case1, i <= 5 ? P2 : P4);
      }
      expect(await desk.filingsOf(agent.address, case1)).to.equal(10);
      expect(await desk.researcherCount(case1)).to.equal(1);
    });
  });

  describe("Gates", function () {
    it("wallet without Agent ID reverts NotAgent (free and paid attempts)", async function () {
      const { owner, desk } = await deployAll();
      const noId = ethers.Wallet.createRandom().connect(ethers.provider);
      await owner.sendTransaction({ to: noId.address, value: ethers.parseEther("0.05") });
      const caseId = await desk.currentCaseId();
      await expect(fileOnce(desk, noId, caseId, 0)).to.be.revertedWithCustomError(desk, "NotAgent");
      await expect(fileOnce(desk, noId, caseId, P2)).to.be.revertedWithCustomError(desk, "NotAgent");
    });

    it("filing from a contract reverts NotEOA", async function () {
      const { owner, registry, desk } = await deployAll();
      const Caller = await ethers.getContractFactory("DeskCaller");
      const caller = await Caller.deploy();
      await registry.setBalance(await caller.getAddress(), 1); // even WITH an Agent ID, EOA gate fires first
      const caseId = await desk.currentCaseId();
      await expect(caller.file(await desk.getAddress(), caseId)).to.be.revertedWithCustomError(desk, "NotEOA");
    });

    it("filing a non-current case reverts WrongCase", async function () {
      const { owner, registry, desk, genesis } = await deployAll();
      const agent = await makeAgent(owner, registry);
      const caseId = await desk.currentCaseId();
      await expect(fileOnce(desk, agent, caseId + 1n, 0)).to.be.revertedWithCustomError(desk, "WrongCase");
      await time.increaseTo(genesis + CASE + 60);
      await expect(fileOnce(desk, agent, caseId, 0)).to.be.revertedWithCustomError(desk, "WrongCase");
    });
  });

  describe("Verdict classes", function () {
    it("Cold <25, Developing 25-100, Confirmed >100 (boundary-checked)", async function () {
      const { owner, registry, desk, genesis } = await deployAll();
      const caseA = firstCaseWith((s) => s < 970, 0);
      await time.increaseTo(genesis + caseA * CASE + 60);
      expect(await desk.currentCaseId()).to.equal(BigInt(caseA));
      expect(await desk.seedOf(caseA)).to.be.lt(970);
      expect(await desk.verdictOf(caseA)).to.equal(0); // Cold, 0 researchers

      const agents = [];
      for (let i = 0; i < 101; i++) agents.push(await makeAgent(owner, registry));
      for (let i = 0; i < 24; i++) await fileOnce(desk, agents[i], caseA, 0);
      expect(await desk.verdictOf(caseA)).to.equal(0); // 24 -> Cold
      await fileOnce(desk, agents[24], caseA, 0);
      expect(await desk.verdictOf(caseA)).to.equal(1); // 25 -> Developing
      for (let i = 25; i < 100; i++) await fileOnce(desk, agents[i], caseA, 0);
      expect(await desk.verdictOf(caseA)).to.equal(1); // 100 -> Developing
      await fileOnce(desk, agents[100], caseA, 0);
      expect(await desk.verdictOf(caseA)).to.equal(2); // 101 -> Confirmed

      const info = await desk.caseInfo(caseA);
      expect(info.researchers).to.equal(101);
      expect(info.findingsCount).to.equal(101);
      expect(info.sealedCase).to.equal(false);
      expect(info.verdict).to.equal(2);
      expect(info.subject).to.equal("Open investigation");

      // Confirmed claim end-to-end: token #1, fee 0.0003, payout 60,000 DOCKET.
      await time.increaseTo(genesis + (caseA + 1) * CASE + 60);
      expect(await desk.claimFeeFor(1)).to.equal(ethers.parseEther("0.0003"));
      const balBefore = await ethers.provider.getBalance(agents[0].address);
      const docketBefore = await (await ethers.getContractAt("DocketToken", await desk.TOKEN())).balanceOf(agents[0].address);
      await desk.connect(agents[0]).claim(1, { value: ethers.parseEther("0.0003") });
      const docketAfter = await (await ethers.getContractAt("DocketToken", await desk.TOKEN())).balanceOf(agents[0].address);
      expect(docketAfter - docketBefore).to.equal(ethers.parseEther("60000"));
      expect(balBefore - (await ethers.provider.getBalance(agents[0].address))).to.be.gt(ethers.parseEther("0.0003")); // fee + gas
    });

    it("Anomaly (seed >= 970) regardless of researcher count; payout 250,000", async function () {
      const { owner, registry, desk, genesis } = await deployAll();
      const caseAnom = firstCaseWith((s) => s >= 970, 0);
      expect(await desk.seedOf(caseAnom)).to.be.gte(970);
      await time.increaseTo(genesis + caseAnom * CASE + 60);
      expect(await desk.verdictOf(caseAnom)).to.equal(3); // Anomaly, 0 researchers
      const agent = await makeAgent(owner, registry);
      await fileOnce(desk, agent, caseAnom, 0);
      expect(await desk.verdictOf(caseAnom)).to.equal(3); // still Anomaly with 1 researcher

      await time.increaseTo(genesis + (caseAnom + 1) * CASE + 60);
      expect(await desk.claimFeeFor(1)).to.equal(ethers.parseEther("0.0005"));
      const token = await ethers.getContractAt("DocketToken", await desk.TOKEN());
      const before = await token.balanceOf(agent.address);
      await desk.connect(agent).claim(1, { value: ethers.parseEther("0.0005") });
      expect((await token.balanceOf(agent.address)) - before).to.equal(ethers.parseEther("250000"));
    });
  });

  describe("Claim", function () {
    async function coldCaseSetup() {
      const ctx = await deployAll();
      const { owner, registry, desk, genesis } = ctx;
      const coldCase = firstCaseWith((s) => s < 970, 0);
      await time.increaseTo(genesis + coldCase * CASE + 60);
      const agent = await makeAgent(owner, registry);
      await fileOnce(desk, agent, coldCase, 0);
      return { ...ctx, agent, coldCase };
    }

    it("before seal reverts CaseNotSealed; claimFeeFor/findingInfo correct", async function () {
      const { desk, agent, coldCase } = await coldCaseSetup();
      expect(await desk.claimFeeFor(1)).to.equal(ethers.parseEther("0.0001"));
      const fi = await desk.findingInfo(1);
      expect(fi.caseId).to.equal(BigInt(coldCase));
      expect(fi.researcher).to.equal(agent.address);
      expect(fi.claimed).to.equal(false);
      expect(fi.classId).to.equal(0);
      expect(fi.claimable).to.equal(false);
      expect(fi.fee).to.equal(ethers.parseEther("0.0001"));
      await expect(desk.connect(agent).claim(1, { value: ethers.parseEther("0.0001") }))
        .to.be.revertedWithCustomError(desk, "CaseNotSealed");
      await expect(desk.claimFeeFor(999)).to.be.revertedWithCustomError(desk, "UnknownFinding");
      await expect(desk.findingInfo(999)).to.be.revertedWithCustomError(desk, "UnknownFinding");
    });

    it("after seal: exact payout, pool decreases, owner receives fee; wrong fee / non-owner / double claim revert", async function () {
      const { owner, registry, desk, token, genesis, agent, coldCase } = await coldCaseSetup();
      const other = await makeAgent(owner, registry);
      await time.increaseTo(genesis + (coldCase + 1) * CASE + 60);
      expect(await desk.isSealed(coldCase)).to.equal(true);

      await expect(desk.connect(agent).claim(1, { value: ethers.parseEther("0.0002") }))
        .to.be.revertedWithCustomError(desk, "WrongValue")
        .withArgs(ethers.parseEther("0.0001"));
      await expect(desk.connect(other).claim(1, { value: ethers.parseEther("0.0001") }))
        .to.be.revertedWithCustomError(desk, "NotFindingOwner");

      const poolBefore = await desk.claimPool();
      const ownerBnbBefore = await ethers.provider.getBalance(owner.address);
      const agentDocketBefore = await token.balanceOf(agent.address);
      await expect(desk.connect(agent).claim(1, { value: ethers.parseEther("0.0001") }))
        .to.emit(desk, "FindingClaimed")
        .withArgs(1, BigInt(coldCase), agent.address, ethers.parseEther("2500"), ethers.parseEther("0.0001"));
      expect((await token.balanceOf(agent.address)) - agentDocketBefore).to.equal(ethers.parseEther("2500"));
      expect(poolBefore - (await desk.claimPool())).to.equal(ethers.parseEther("2500"));
      expect((await ethers.provider.getBalance(owner.address)) - ownerBnbBefore).to.equal(ethers.parseEther("0.0001"));
      expect(await desk.totalClaimed()).to.equal(1);
      expect((await desk.findingInfo(1)).claimed).to.equal(true);
      expect((await desk.findingInfo(1)).claimable).to.equal(false);

      await expect(desk.connect(agent).claim(1, { value: ethers.parseEther("0.0001") }))
        .to.be.revertedWithCustomError(desk, "AlreadyClaimed");
    });

    it("claim from a contract reverts NotEOA even when the contract owns the Finding", async function () {
      const { owner, registry, desk, nft, genesis, agent, coldCase } = await coldCaseSetup();
      const Caller = await ethers.getContractFactory("DeskCaller");
      const caller = await Caller.deploy();
      // Transfer the Finding to the contract, then it is the owner but still a contract.
      await nft.connect(agent).transferFrom(agent.address, await caller.getAddress(), 1);
      await time.increaseTo(genesis + (coldCase + 1) * CASE + 60);
      await expect(caller.claim(await desk.getAddress(), 1, { value: ethers.parseEther("0.0001") }))
        .to.be.revertedWithCustomError(desk, "NotEOA");
    });
  });

  describe("Marketplace", function () {
    async function listedSetup(priceEth = "0.01") {
      const ctx = await deployAll();
      const { owner, registry, desk, nft, market } = ctx;
      const agent = await makeAgent(owner, registry);
      const caseId = await desk.currentCaseId();
      await fileOnce(desk, agent, caseId, 0); // token #1
      return { ...ctx, agent, caseId, price: ethers.parseEther(priceEth) };
    }

    it("list requires ownership, price > 0 and approval; updatePrice/cancel are seller-only", async function () {
      const { owner, registry, nft, market, agent, price } = await listedSetup();
      const stranger = await makeAgent(owner, registry);
      await expect(market.connect(agent).list(1, price)).to.be.revertedWithCustomError(market, "NotApproved");
      await nft.connect(agent).approve(await market.getAddress(), 1);
      await expect(market.connect(agent).list(1, 0)).to.be.revertedWithCustomError(market, "InvalidPrice");
      await expect(market.connect(stranger).list(1, price)).to.be.revertedWithCustomError(market, "NotTokenOwner");
      await market.connect(agent).list(1, price);
      let l = await market.listing(1);
      expect(l.seller).to.equal(agent.address);
      expect(l.price).to.equal(price);
      expect(l.active).to.equal(true);

      await expect(market.connect(stranger).updatePrice(1, price * 2n)).to.be.revertedWithCustomError(market, "NotSeller");
      await expect(market.connect(agent).updatePrice(1, 0)).to.be.revertedWithCustomError(market, "InvalidPrice");
      await market.connect(agent).updatePrice(1, price * 2n);
      expect((await market.listing(1)).price).to.equal(price * 2n);

      await expect(market.connect(stranger).cancel(1)).to.be.revertedWithCustomError(market, "NotSeller");
      await market.connect(agent).cancel(1);
      expect((await market.listing(1)).active).to.equal(false);
      await expect(market.connect(agent).cancel(1)).to.be.revertedWithCustomError(market, "NotActive");
    });

    it("buy splits 95% seller / 5% royalty; wrong value reverts; listing clears; NFT moves", async function () {
      const { owner, nft, market, agent, price } = await listedSetup("0.02");
      const buyer = ethers.Wallet.createRandom().connect(ethers.provider);
      await owner.sendTransaction({ to: buyer.address, value: ethers.parseEther("1") });
      await nft.connect(agent).approve(await market.getAddress(), 1);
      await market.connect(agent).list(1, price);

      await expect(market.connect(buyer).buy(1, { value: ethers.parseEther("0.01") }))
        .to.be.revertedWithCustomError(market, "WrongValue")
        .withArgs(price);
      await expect(market.connect(buyer).buy(1, { value: ethers.parseEther("0.03") }))
        .to.be.revertedWithCustomError(market, "WrongValue")
        .withArgs(price);

      const sellerBefore = await ethers.provider.getBalance(agent.address);
      const ownerBefore = await ethers.provider.getBalance(owner.address);
      await expect(market.connect(buyer).buy(1, { value: price }))
        .to.emit(market, "Sold")
        .withArgs(1, agent.address, buyer.address, price);
      expect((await ethers.provider.getBalance(agent.address)) - sellerBefore).to.equal(price * 95n / 100n);
      expect((await ethers.provider.getBalance(owner.address)) - ownerBefore).to.equal(price * 5n / 100n);
      expect(await nft.ownerOf(1)).to.equal(buyer.address);
      expect((await market.listing(1)).active).to.equal(false);
      await expect(market.connect(buyer).buy(1, { value: price })).to.be.revertedWithCustomError(market, "NotActive");
    });

    it("a Finding bought on the marketplace can still be claimed by its (non-Agent) holder", async function () {
      const { owner, registry, desk, nft, market, token, genesis, agent, caseId, price } = await listedSetup("0.01");
      const buyer = ethers.Wallet.createRandom().connect(ethers.provider); // NO Agent ID
      await owner.sendTransaction({ to: buyer.address, value: ethers.parseEther("1") });
      await nft.connect(agent).approve(await market.getAddress(), 1);
      await market.connect(agent).list(1, price);
      await market.connect(buyer).buy(1, { value: price });

      const fi = await desk.findingInfo(1);
      await time.increaseTo(genesis + (Number(caseId) + 1) * CASE + 60);
      const before = await token.balanceOf(buyer.address);
      await desk.connect(buyer).claim(1, { value: fi.fee });
      const payout = [2500n, 12500n, 60000n, 250000n][Number(fi.classId)];
      expect((await token.balanceOf(buyer.address)) - before).to.equal(ethers.parseEther(payout.toString()));
    });

    it("NFT royalty is 5% to the owner", async function () {
      const { owner, nft } = await listedSetup();
      const [receiver, amount] = await nft.royaltyInfo(1, ethers.parseEther("1"));
      expect(receiver).to.equal(owner.address);
      expect(amount).to.equal(ethers.parseEther("0.05"));
    });
  });

  describe("tokenURI", function () {
    it("decodes to valid JSON with right caseId, researcher, class and sealed flag; sealed flips after warp", async function () {
      const { owner, registry, desk, nft, genesis } = await deployAll();
      const agent = await makeAgent(owner, registry);
      const caseId = Number(await desk.currentCaseId());
      await fileOnce(desk, agent, caseId, 0);
      const meta = decodeTokenURI(await nft.tokenURI(1));
      expect(meta.name).to.equal("Docket Finding #1");
      const attrs = Object.fromEntries(meta.attributes.map((a) => [a.trait_type, a.value]));
      expect(attrs.Case).to.equal(caseId);
      expect(attrs.Researcher.toLowerCase()).to.equal(agent.address.toLowerCase());
      expect(attrs.Class).to.equal(["Cold", "Developing", "Confirmed", "Anomaly"][Number(await desk.verdictOf(caseId))]);
      expect(attrs.Sealed).to.equal(false);

      await time.increaseTo(genesis + (caseId + 1) * CASE + 60);
      const metaSealed = decodeTokenURI(await nft.tokenURI(1));
      const attrsSealed = Object.fromEntries(metaSealed.attributes.map((a) => [a.trait_type, a.value]));
      expect(attrsSealed.Sealed).to.equal(true);
      expect(meta.image).to.equal(undefined);
    });

    it("before the Desk is set, class reads Unsealed and sealed is false", async function () {
      const [owner] = await ethers.getSigners();
      const Nft = await ethers.getContractFactory("DocketFindings");
      const nft = await Nft.deploy(owner.address);
      await nft.setMinter(owner.address, true);
      await nft.mint(owner.address, 7);
      const meta = decodeTokenURI(await nft.tokenURI(1));
      const attrs = Object.fromEntries(meta.attributes.map((a) => [a.trait_type, a.value]));
      expect(attrs.Case).to.equal(7);
      expect(attrs.Class).to.equal("Unsealed");
      expect(attrs.Sealed).to.equal(false);
      expect(await nft.totalMinted()).to.equal(1);
      await expect(nft.tokenURI(999)).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken");
    });
  });

  describe("GENESIS / currentCaseId / isSealed timing + subjects", function () {
    it("case 0 at deploy, rolls every 3h; isSealed flips at the boundary; subject default + owner set", async function () {
      const { owner, desk, genesis } = await deployAll();
      expect(await desk.currentCaseId()).to.equal(0);
      expect(await desk.isSealed(0)).to.equal(false);
      expect(await desk.caseSubject(0)).to.equal("Open investigation");

      await time.increaseTo(genesis + CASE);
      expect(await desk.currentCaseId()).to.equal(1);
      expect(await desk.isSealed(0)).to.equal(true);
      expect(await desk.isSealed(1)).to.equal(false);

      await time.increaseTo(genesis + 2 * CASE + 10);
      expect(await desk.currentCaseId()).to.equal(2);

      await expect(desk.connect((await ethers.getSigners())[1]).setCaseSubject(2, "x"))
        .to.be.revertedWithCustomError(desk, "OwnableUnauthorizedAccount");
      await expect(desk.setCaseSubject(2, "What moved the market?"))
        .to.emit(desk, "CaseSubjectSet")
        .withArgs(2, "What moved the market?");
      expect(await desk.caseSubject(2)).to.equal("What moved the market?");
      const info = await desk.caseInfo(2);
      expect(info.subject).to.equal("What moved the market?");
    });
  });
});
