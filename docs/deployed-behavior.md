# Deployed behavior: funds, fees, staking, and redemption

This guide compares the public documentation with the source and state observed on Ethereum mainnet. It is a dated reference, not a promise that mutable settings or market conditions will remain the same. The local [documentation catalog](../) links each published source page.

## Where the protocol assets sit

Short answer: **no**. The CDPs custody stETH collateral; boxETH is split between the boxFEE vault, conversion and reward reserves, DEX pools, and holders. This inventory reads Ethereum mainnet at block **[26,355,994](https://etherscan.io/block/26355994)** (2026-11-06 13:04:35 UTC). Token amounts come from `balanceOf` and protocol getters at that block. It separates borrower collateral, reward and conversion reserves, treasury assets, and market liquidity; these are not interchangeable balances.

| Location | Snapshot | What the balance represents |
| --- | --- | --- |
| [v1 CDP](https://etherscan.io/address/0x7f0A0C7149a46Bf943cCd412da687144b49C6014) | 83.886447 stETH held; `totaldeposits` 83.527918 stETH; `totalDebt` 7.662635 boxETH | Borrower collateral backing open positions, not treasury cash. |
| [v1.1 CDP](https://etherscan.io/address/0x6ffD098E92B606b2947b89A08911C00ca06890FA) | 427.629762 stETH held; `totaldeposits` 427.085351 stETH; `totalDebt` 295.849784 boxETH | Borrower collateral backing open positions, not treasury cash. |
| [boxFEE vault](https://etherscan.io/address/0xE4B91fAf8810F8895772E7cA065D4CB889120f94) | 248.305217 boxETH backing 2,336.485518 boxFEE shares; 1 share converts to 0.1062729535 boxETH | This is the vault's backing for share holders, not unencumbered protocol cash. The share claim and the underlying boxETH must not be counted twice. |
| [Fee-split and staking contract](https://etherscan.io/address/0x320c871b6f7721083604FfdD8070E64c1d3c5d7C) | 2.138155 stETH (`tradeable`); 993.917233 boxFEE staked; 1.469417 boxETH held and reported as `unclaimed` | Both CDPs currently point `feeSplitAddress` here. Its converter-only `trade(amount)` swaps boxETH from the converter for its stETH `tradeable` balance; the boxETH balance is the reward reserve. |
| [PSM](https://etherscan.io/address/0x24146D1B3339Cf76b455dC42e71Ea5Cdff4aE0d7) | 2.173746 stETH (`tradeable`); 0.672505 boxETH | Its `synth` is boxETH and its `tradeable` token is stETH. The PSM's `trade(amount)` is converter-only, so this stETH is a small restricted reserve rather than open market liquidity. The boxETH balance also receives CDP friction fees. |
| [Treasury / incentives Safe](https://etherscan.io/address/0x98e6475C01D018Ae78c02ef48738f687538226Af) | 0.626500 stETH, 100 USDC, 21.720124 boxFEE shares, and 0.005999 boxETH | At this block, the Safe is both the v1.1 `incentivesModule` and the PSM's configured treasury. Its boxFEE shares represent about 2.308262 boxETH at the current vault conversion; that is a claim on the vault assets above, not additional boxETH backing. |

Across the two CDPs, the contracts hold **511.516209 stETH** against aggregate `totaldeposits` of **510.613269 stETH** and aggregate debt of **303.512419 boxETH**. The 0.902940 stETH balance difference is not classified as free treasury cash; stETH rebases and the CDP accounting balance is not the same as the token balance. The boxETH total supply was **305.616284**; the boxFEE vault alone held **81.25%** of it.

The Safe itself is a much smaller, mixed treasury position than the protocol's contract balances: its direct snapshot holdings were 0.626500 stETH, 100 USDC, 21.720124 boxFEE, and 0.005999 boxETH, plus the active Uniswap position below. CDP collateral belongs to open borrower positions, and the boxFEE vault's boxETH backs share holders; neither is free Safe inventory.

The fee-staking contract's stETH balance is its declared `tradeable` token, not a stray balance: CDP fee transfers go to `feeSplitAddress`, and its converter role can trade that stETH for boxETH. Its boxFEE balance is staked by users, while the boxETH `unclaimed` amount is owed through staking reward accounting. The PSM has a separate, similarly restricted stETH reserve.

### Uniswap liquidity is much smaller than the vault balance

At the same block, the two largest active Uniswap V3 pools with a material boxETH balance that we identified were:

| Pool | Fee | Pool token balances |
| --- | ---: | ---: |
| [boxETH / WETH](https://etherscan.io/address/0x287139599f1B5849f12Cf18244A74F595da9936D) | 0.05% | 5.363171 boxETH and 5.410033 WETH |
| [boxETH / wstETH](https://etherscan.io/address/0x703a177fCB4DeF281D180D3619A5EDbaE67ec7b5) | 1.00% | 4.395744 boxETH and 3.519856 wstETH |

Together these two pools held **9.758915 boxETH**, about **3.19%** of boxETH total supply. The Uniswap V3 factory has one additional boxETH/WETH pool at the 1% tier, but its liquidity was zero; it has no direct boxETH/stETH pool in the four fee tiers. We also found no Uniswap V2 pair for boxETH/WETH or boxETH/stETH. This is a Uniswap-specific check, not a claim that every Ethereum venue was exhaustively enumerated.

The treasury Safe owns active Uniswap V3 position NFT [517308](https://etherscan.io/nft/0xc36442b4a4522e871399CD717aBDD847Ab11FE88/517308) in the boxETH/WETH pool. At this block its in-range position represented approximately **5.291 boxETH and 5.268 WETH**; this is already part of that pool's balances and must not be added again. The second pool is a separate boxETH/wstETH market. The existing browser quote helper does not currently include that wstETH route.

Uniswap QuoterV2 quotes show how quickly the WETH route degrades with size: at this block, selling exactly 1 boxETH through boxETH/WETH (0.05%) then WETH/stETH (1%) quoted **0.872082 stETH**; buying exactly 1 boxETH on the same route quoted **1.234991 stETH**. The alternative boxETH/wstETH route quoted 1.047017 wstETH, or **1.307296 stETH** after unwrapping. A 5 boxETH exact-output quote on the WETH route rose to **83.006646 stETH**, while the wstETH route returned no quote at that size. These are block-pinned indicative quotes, not guaranteed execution prices. A large boxFEE vault balance therefore does not imply deep sell-side DEX liquidity.

One separate third-party contract, [DeFi Garage](https://etherscan.io/address/0xCdD7E78bB4DC4F144c71D1aE700B284aC362f5EE), held 8.175493 boxETH directly at the snapshot. Its declared vault asset is boxETH, but it is not a Cat-in-a-Box treasury address or an AMM pool. Other boxETH remains in wallet and smaller-contract balances; those balances are not assigned to the protocol without evidence of control.

## Yield fee: v1 and v1.1 use different accounting

Each CDP runs `sync()` before selected actions, then calls `fetch()` for the affected position. The two deployed versions calculate and allocate excess yield differently.

For **v1**, when excess collateral exceeds 100 wei, the contract takes:

```solidity
protocolFees = excess * idleFee / 100
  + excess * totalDebt / (totaldeposits * 4 + 1);
```

It allocates the remaining yield by `totaldeposits - totalDebt`; a position's allocation weight is `deposited - debt`. The constructor initializes `idleFee` to `1`, and the admin setter caps it at `75`. The full fee is sent to the fee-split address.

For **v1.1**, sync only distributes yield when excess exceeds 100 wei **and** `totalDebt > 0`:

```solidity
protocolFees = excess * idleFee / 100;
value = excess - protocolFees;
totalPoints += value * pointMultiplier / totalDebt;
```

The position allocation weight is its debt. The constructor also initializes `idleFee` to `1`, while its admin setter allows a value up to `99`. Half the fee, rounded down, is transferred to the fee-split address and half to the incentives module. This is a flat configured share; v1.1 does not add v1's debt-to-deposit surcharge.

In both versions, `fetch()` settles points already accrued even if the current call has no new excess to distribute. With auto-repay enabled and owing no greater than debt, it reduces the position debt and aggregate `totaldeposits`, while leaving that position's `deposited` value unchanged. If the allocation exceeds debt or auto-repay is disabled, the position's deposited value increases by the owing amount. These are code-level behaviors, not borrower APRs. Solidity integer division determines exact values.

### Mainnet snapshot

At block **26,354,277** (2026-11-06 07:20:47 UTC), both deployed CDP versions reported `idleFee = 10` and `ltv() = 9900` (99%). Based on the aggregate debt-to-deposit ratios at that block, the formula yielded approximately:

| Contract | Debt / deposits | Fee share of excess yield |
| --- | ---: | ---: |
| v1 | 9.1737% | 12.2934% |
| v1.1 | 69.2718% | 10% |

The percentages describe that block only and assume the sync threshold is met; v1.1's setting contributes no distribution when aggregate debt is zero. The app reads current values and uses version-specific settlement math. Version names are stable identifiers; “Low LTV” and “High LTV” interface labels do not replace the live `ltv()` getter.

## boxFEE backing and conversion

The deployed boxFEE contract holds boxETH as its asset. Its `totalAssets()` reads the boxETH balance held by the vault, and `convertToAssets(shares)` derives a current share conversion from vault assets and total supply. At the same snapshot, one boxFEE converted to about **0.106273 boxETH**. This is a contract conversion, not a market quote or a guarantee of future liquidity.

The deployed `deposit(assets, receiver)` and `mint(shares, receiver)` entry points transfer and issue the same nominal amount. That differs from the usual ERC-4626 expectation that minting a chosen share amount may require a different asset amount. Their Solidity return variables are not set to those transferred/issued amounts, so the interface does not use the return value as a transaction preview. It separately displays the live `convertToAssets` value and refreshes balances after the receipt.

For exits, `withdraw(assets, receiver, owner)` computes the shares to burn with `previewWithdraw`, which rounds up. `redeem(shares, receiver, owner)` pays `previewRedeem(shares)`, using the live asset/share conversion and rounding down. The vault conversion is not a market quote.

## boxFEE staking rewards are paid in boxETH

The fee-staking contract accepts boxFEE as stake collateral and distributes its configured reward token pro rata through its points accounting. The deployed reward token is **boxETH**. Calling `poke(account)` updates accrued accounting for that account and is the claim interaction used by the interface. This is separate from a borrower's CDP yield accounting.

The `trade` function is restricted to the converter role. It is an internal protocol conversion path, not a user-facing claim or trading action.

## Direct boxETH to stETH redemption

The CDP's permissionless `stabilisePeg(amount, depositor)` burns boxETH from the caller, pays a friction amount in boxETH to that CDP's PSM, reduces the selected target's debt and collateral by the amount processed, and transfers the same nominal amount of collateral to the caller. For the deployed contracts, that collateral is stETH.

Before applying the one-quarter cap, the CDP runs `sync()` and `fetch(target)`. The interface projects the selected version's fee, allocation weights, accrued points, and auto-repay behavior from one block before calculating the cap and friction fee. The maximum processed in one call after that settlement is one quarter of the target's debt:

```text
maxRedeem = debt[target] / 4
```

If a larger amount is supplied, the contract silently reduces it to that maximum. The UI calculates the current cap, previews the processed amount, refreshes it before signing, and warns that there is no minimum-output argument in the call. A target can be another borrower's address; redemption changes that position's debt and collateral.

The friction fee follows the deployed integer operation order on the settled target state:

```text
fee = amount / 10 - (amount / 10 * debt[target]) / deposited[target]
```

`resolvingFeePerToken(target)` exposes a per-token estimate. It is useful for display, but it cannot replace the exact amount-specific calculation because integer division can change the final fee. The older [Resolve guide](https://docs.catinabox.finance/docs/guides/resolve/) refers to a different view name and describes the friction asset differently from the deployed call; check the contract method and transaction details.

### Observed transaction

Transaction [`0xf6d9…bcd8a`](https://etherscan.io/tx/0xf6d9bc750e835f35890db41a71ccd35615374a14a86f3473e457dc28d69bcd8a) called the v1.1 CDP at block 26,256,302 on 2026-10-23. The caller selected a different borrower's position. The transaction burned **0.9305 boxETH**, sent **0.004593404219152699 boxETH** to the PSM, and transferred **0.9305 stETH** to the caller. The target's debt and deposited collateral each fell by 0.9305.

This is a CDP-backed resolution route. It depends on an active target position, its current debt and collateral, sufficient boxETH, and the state when the transaction executes; it is not an unlimited redemption pool. The CDP's `psm()` setting can be changed by an administrator, so the app reads and displays the live recipient for review and identifies the fee transfer recipient from the receipt when the transfer event is available.

### Allowance left after redemption

The deployed boxETH `burnFrom` checks allowance but writes the same amount back instead of decrementing it. This affects both repayment and redemption. A repayment that approves exactly its burn amount can leave that same amount approved. `stabilisePeg` first uses `transferFrom` for the PSM fee and then calls `burnFrom` for the requested amount. If the wallet starts with an exact allowance equal to `amount + fee`, the fee transfer reduces that allowance by `fee`, and the burn can leave approximately `amount` approved.

The app requests only the calculated total, refreshes allowance after execution, shows any remainder, and offers a revoke action. Users should review the allowance prompt and may revoke any residual approval.

The optional browser scan reads the seven borrower-history event types from each CDP's verified deployment block, then checks active positions at one pinned block. It keeps confirmed active rows when the connected wallet has no boxETH and reports failed position reads separately from confirmed inactive positions. It asks the Uniswap v3 factory for direct boxETH/stETH pools and boxETH/WETH/stETH routes, and uses QuoterV2 exact-output quotes for the full boxETH amount including friction. It does not currently quote the separate boxETH/wstETH pool described above. The scanner remains read-only; it does not trade. An indicative net is shown only when the connected wallet can cover the amount and allowance, an on-chain market quote is available, and redemption gas can be priced in stETH. It subtracts estimated `stabilisePeg` gas, but **does not include gas for a separate transaction that acquires boxETH**. Otherwise profitability is unavailable and rows are sorted by the friction-adjusted redemption rate.

## Sources and deployed contracts

The source and verified addresses below are the reference points used for the app's ABI and behavior. The app also reads mutable values at runtime. The PSM row is the configured address observed at the snapshot; v1.1 exposes an administrator setter for `psm()`.

| Component | Mainnet address | Source |
| --- | --- | --- |
| v1 CDP | `0x7f0A0C7149a46Bf943cCd412da687144b49C6014` | [Verified code](https://etherscan.io/address/0x7f0A0C7149a46Bf943cCd412da687144b49C6014#code) |
| v1.1 CDP | `0x6ffD098E92B606b2947b89A08911C00ca06890FA` | [Verified code](https://etherscan.io/address/0x6ffD098E92B606b2947b89A08911C00ca06890FA#code) |
| boxETH | `0x7690202e2C2297bcD03664e31116d1dFfE7e3B73` | [Verified code](https://etherscan.io/address/0x7690202e2C2297bcD03664e31116d1dFfE7e3B73#code) |
| stETH | `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` | [Lido contract](https://etherscan.io/address/0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84#code) |
| boxFEE | `0xE4B91fAf8810F8895772E7cA065D4CB889120f94` | [Verified code](https://etherscan.io/address/0xE4B91fAf8810F8895772E7cA065D4CB889120f94#code) |
| Fee staking | `0x320c871b6f7721083604FfdD8070E64c1d3c5d7C` | [Verified code](https://etherscan.io/address/0x320c871b6f7721083604FfdD8070E64c1d3c5d7C#code) |
| PSM | `0x24146D1B3339Cf76b455dC42e71Ea5Cdff4aE0d7` | [Verified code](https://etherscan.io/address/0x24146D1B3339Cf76b455dC42e71Ea5Cdff4aE0d7#code) |
| Treasury / v1.1 incentives module | `0x98e6475C01D018Ae78c02ef48738f687538226Af` | [Safe address](https://etherscan.io/address/0x98e6475C01D018Ae78c02ef48738f687538226Af) |

Primary repository sources: [`catinaboxcdp.sol`](https://github.com/catinaboxfinance/cat-in-a-box-protocol/blob/main/contracts/catinaboxcdp.sol), [`feeSplitStaking.sol`](https://github.com/catinaboxfinance/cat-in-a-box-protocol/blob/main/contracts/feeSplitStaking.sol), and [`feeSplitToken.sol`](https://github.com/catinaboxfinance/cat-in-a-box-protocol/blob/main/contracts/feeSplitToken.sol).
