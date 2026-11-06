## What the protocol does

Cat-in-a-Box lets a user deposit stETH into one of two Ethereum mainnet collateralized debt position contracts and borrow boxETH against that position. The app supports the deployed v1 and v1.1 contracts. Each version has its own address, balances, settings, and positions; activity in one version does not migrate to the other.

The contracts use stETH as collateral and issue boxETH as debt. A position's borrowing limit comes from its contract's live `ltv()` value. A mint is a protocol debt operation, while buying or selling boxETH on a DEX uses an external market price. The protocol's soft peg does not guarantee that a DEX quote will be 1 boxETH for 1 stETH.

## Yield and debt accounting

The CDP contracts account for stETH held above the system's tracked deposits as excess yield. They distribute eligible excess through point accounting, with different weights and fee formulas in v1 and v1.1. The position is settled when selected CDP actions run; the displayed accrued amount is not a fixed-rate APR or a promise of future yield.

If a position's auto-repay flag is enabled, settled yield can reduce its debt when the amount fits within that debt. Otherwise, yield is added to the position's deposited balance. See [v1 and v1.1](../v1-1/) for the version-specific formulas and [deployed behavior](../deployed-behavior/) for the dated chain snapshot.

## Ways to use a position

The app supports depositing stETH, borrowing boxETH, repaying debt, and withdrawing collateral that the contract allows. Users can also interact with boxFEE, stake boxFEE to accrue boxETH rewards, and review the permissionless `stabilisePeg` path for obtaining stETH against boxETH while reducing a target position.

Those operations have different contract calls and allowances. Begin with the [borrower guide](../user-guide/) and [approval guide](../approvals/). Verify the [contract addresses](../contracts/) before interacting through another wallet or explorer.

## Sources and freshness

This guide describes the app and deployed-contract behavior reviewed on 2026-11-06. It does not promise that mutable settings, balances, DEX prices, or market liquidity will remain the same. The original project page is linked with the other source material at the end of this article.
