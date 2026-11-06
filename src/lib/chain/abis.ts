import { parseAbi } from 'viem';

export const cdpAbi = parseAbi([
	'function Owing(address depositor) view returns (uint256)',
	'function collateral() view returns (address)',
	'function debt(address depositor) view returns (uint256)',
	'function deposited(address depositor) view returns (uint256)',
	'function enableRepaying(address depositor) view returns (bool)',
	'function idleFee() view returns (uint256)',
	'function ltv() view returns (uint256)',
	'function mintingFee() view returns (uint256)',
	'function lastPoints(address depositor) view returns (uint256)',
	'function psm() view returns (address)',
	'function resolvingFeePerToken(address depositor) view returns (uint256)',
	'function resolvingFeePerTokenAfterMoreDebt(address depositor, uint256 additionalDebt) view returns (uint256)',
	'function synthetic() view returns (address)',
	'function totalDebt() view returns (uint256)',
	'function totaldeposits() view returns (uint256)',
	'function totalPoints() view returns (uint256)',
	'function pointMultiplier() view returns (uint256)',
	'function unclaimed() view returns (uint256)',
	'function deposit(uint256 amount)',
	'function mint(uint256 amount)',
	'function repay(uint256 amount)',
	'function withdraw(uint256 amount)',
	'function setRepayFlag(bool flag)',
	'function stabilisePeg(uint256 amount, address depositor)',
	'function poke(address depositor)',
	'event _deposit(address indexed user, uint256 indexed amount)',
	'event _withdrawal(address indexed user, uint256 indexed amount)',
	'event _mint(address indexed user, uint256 indexed amount)',
	'event _repay(address indexed user, uint256 indexed amount)',
	'event _liquidate(address indexed user, uint256 indexed amount)',
	'event _flagset(address indexed user, bool indexed amount)',
	'event _stabilisePeg(address indexed user, uint256 indexed amount, uint256 indexed fee)'
]);

export const erc20Abi = parseAbi([
	'function allowance(address owner, address spender) view returns (uint256)',
	'function approve(address spender, uint256 amount) returns (bool)',
	'function balanceOf(address account) view returns (uint256)',
	'function decimals() view returns (uint8)',
	'function name() view returns (string)',
	'function symbol() view returns (string)',
	'function totalSupply() view returns (uint256)',
	'function transfer(address recipient, uint256 amount) returns (bool)',
	'function transferFrom(address owner, address recipient, uint256 amount) returns (bool)',
	'function burnFrom(address account, uint256 amount)',
	'event Transfer(address indexed from, address indexed to, uint256 value)'
]);

export const boxFeeAbi = parseAbi([
	'function allowance(address owner, address spender) view returns (uint256)',
	'function approve(address spender, uint256 amount) returns (bool)',
	'function asset() view returns (address)',
	'function balanceOf(address account) view returns (uint256)',
	'function convertToAssets(uint256 shares) view returns (uint256)',
	'function decimals() view returns (uint8)',
	'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
	'function mint(uint256 shares, address receiver) returns (uint256 assets)',
	'function previewWithdraw(uint256 assets) view returns (uint256 shares)',
	'function previewRedeem(uint256 shares) view returns (uint256 assets)',
	'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)',
	'function totalAssets() view returns (uint256)',
	'function totalSupply() view returns (uint256)',
	'function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)'
]);

export const feeStakingAbi = parseAbi([
	'function Owing(address depositor) view returns (uint256)',
	'function collateral() view returns (address)',
	'function deposited(address depositor) view returns (uint256)',
	'function rewardsToken() view returns (address)',
	'function totaldeposits() view returns (uint256)',
	'function unclaimed() view returns (uint256)',
	'function deposit(uint256 amount)',
	'function withdraw(uint256 amount)',
	'function poke(address depositor)'
]);
