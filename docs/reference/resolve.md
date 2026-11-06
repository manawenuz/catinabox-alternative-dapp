## Direct CDP redemption

The deployed resolver path is `stabilisePeg(amount, depositor)` on the selected CDP. It is permissionless: the caller supplies boxETH, and the contract applies it to a target position. The contract then reduces the target's debt and deposited collateral by the processed amount and transfers the same nominal amount of collateral to the caller. The configured collateral for these deployments is stETH.

The call also transfers a friction fee in boxETH to the CDP's current PSM recipient. The fee is calculated against the target's settled position, and the contract caps the processed amount at one quarter of its debt:

```text
maxRedeem = debt[target] / 4
fee = amount / 10 - (amount / 10 * debt[target]) / deposited[target]
```

Solidity integer division and operation order affect the exact fee. `resolvingFeePerToken(target)` is an estimate; it is not a substitute for calculating the fee for the exact amount. The interface projects the selected CDP's `sync()` and `fetch(target)` settlement before showing the cap and fee.

## Use the local resolver flow

1. In **Redeem**, enter a target depositor or choose one from the optional scan.
2. Review its CDP version, debt, collateral, maximum processed amount, and friction fee.
3. Review the total boxETH required, including the fee, the live PSM recipient, stETH amount, market quote, and gas estimate if available.
4. Approve the exact boxETH amount if needed, then review the refreshed estimate and confirm the redemption separately.
5. Check the transaction receipt for the actual target, fee, boxETH burn, PSM transfer, and stETH transfer.

The contract has no minimum-output argument. A state change between review and inclusion can affect the target, processed amount, fee, and recipient. A third-party target is modified by the redemption; verify its address carefully.

## Optional history scan

The browser scan reads the v1 and v1.1 borrower event histories from their configured deployment blocks, then checks active positions at a pinned block. It is user-started, read-only, resumable, and cancellable. RPC limits can cause partial position reads; failed reads are reported separately from inactive positions.

For ranking, the app looks for direct boxETH/stETH or boxETH/WETH/stETH Uniswap v3 routes and quotes the full boxETH amount, including friction. An indicative net is shown only when the wallet can cover the amount and allowance and both market and gas estimates are available. The displayed net subtracts estimated redemption gas, but excludes gas for a separate transaction that acquires boxETH. If a profit estimate cannot be made, candidates are sorted by friction-adjusted redemption rate rather than labeled profitable.

The scanner does not trade or execute `stabilisePeg`. Market prices, gas, target state, and liquidity can change before a transaction is mined.
