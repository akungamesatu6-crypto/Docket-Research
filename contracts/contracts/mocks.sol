// SPDX-License-Identifier: MIT
// Test-only mock of the SPACE ID Agent ID registry.
// The real registry lives at 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F on
// BSC mainnet; on the local Hardhat network that address holds no code,
// so tests deploy this mock and fund wallets through setBalance.
// NOTE: the Desk hardcodes the real registry address, so tests cannot swap
// it — instead the test suite deploys the Desk and then uses Hardhat's
// `hardhat_setCode` to place this mock's bytecode at the real registry
// address (see test/docket.test.js).
pragma solidity ^0.8.24;

contract MockAgentRegistry {
    mapping(address => uint256) public balances;

    function setBalance(address account, uint256 amount) external {
        balances[account] = amount;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }
}

// Test-only helper: a contract that forwards fileFinding / claim calls to
// the Desk, used to prove the EOA gate (msg.sender == tx.origin) rejects
// contract callers with NotEOA.
interface IDeskLike {
    function fileFinding(uint256 caseId) external payable;
    function claim(uint256 tokenId) external payable;
}

contract DeskCaller {
    function file(address desk, uint256 caseId) external payable {
        IDeskLike(desk).fileFinding{value: msg.value}(caseId);
    }

    function claim(address desk, uint256 tokenId) external payable {
        IDeskLike(desk).claim{value: msg.value}(tokenId);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
