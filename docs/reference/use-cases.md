## Current ways to use the protocol

| Goal | Current path | What it depends on |
| --- | --- | --- |
| Borrow against stETH | Deposit stETH and mint boxETH in v1 or v1.1. | The selected CDP's live collateral limit, your position, and any v1.1 mint fee. |
| Reduce debt | Repay boxETH to the same CDP version that holds the position. | A boxETH balance, allowance, and the debt remaining after yield settlement. |
| Withdraw collateral | Withdraw stETH that remains available after the contract's collateral check. | Current debt, deposited collateral, and the CDP's live `ltv()` setting. |
| Compound or claim protocol value | Use the CDP's settlement behavior, the boxFEE vault, or fee staking. | These are separate accounting systems; boxFEE staking rewards are paid in boxETH. |
| Resolve a position | Call `stabilisePeg` with boxETH against an active target position. | A maximum of one quarter of target debt per call, a friction fee, sufficient boxETH, and state at inclusion. |

## Borrowing and repayment

Borrowed boxETH is an ERC-20 token that can be held or used in external applications. The local app does not swap it, provide liquidity, or promise a market price. Its Uniswap link opens a separate service. Market access, liquidity, fees, and execution risk are outside the CDP contracts.

Repayment reduces boxETH debt. The app checks the current position and simulates the selected contract call before presenting the transaction. The deployed boxETH `burnFrom` allowance behavior can leave a residual approval after repayment; see [approvals](../approvals/) for the details and revocation path.

## boxFEE and staking

The deployed boxFEE contract is a share token whose underlying asset is boxETH. Its on-chain conversion is based on vault assets and share supply. It is distinct from a DEX price. The staking contract accepts boxFEE and distributes boxETH through its points accounting; neither operation guarantees a particular yield or market exit price.

## Resolution is not a guaranteed arbitrage

The app's optional scanner looks for active positions and reads on-chain market quotes. It does not buy boxETH or submit a resolution automatically. A positive estimate is indicative, can change before execution, and excludes gas for a separate transaction used to acquire boxETH. Review the [resolution guide](../resolve/) and all transaction details before acting.
