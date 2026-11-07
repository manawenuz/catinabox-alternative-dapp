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

The browser scan reads the v1 and v1.1 borrower event histories from their configured deployment blocks, then checks active positions at a pinned block. It is user-started, read-only, resumable, and cancellable. RPC limits can cause partial position reads; failed reads are reported separately from inactive positions. The worker pauses automatically after 1,000 provider requests or five minutes in one resume session, saves its checkpoint, and displays which limit was reached. The browser console also records structured scan start, pause, resume, completion, cancellation, and error events with the version and block checkpoint where available.

Enter the amount of boxETH you want to redeem to compare the same amount against every scanned position whose **Max redeem** covers it. Candidates below that threshold are skipped. Before comparison, the table sorts by Max redeem descending. After comparison, the best available return is first; sortable columns include target/version, debt, Max redeem, friction fee, total boxETH required, stETH returned, and estimated return. The estimate separates boxETH spent (requested amount plus friction) from stETH received (the requested amount).

The app looks for direct boxETH/stETH or boxETH/WETH/stETH Uniswap v3 routes and quotes the exact requested amount, including friction. Net return after estimated redemption gas is available only when wallet balance, allowance, a market quote, and gas conversion are available; it excludes gas for a separate transaction that acquires boxETH. When a full net estimate is unavailable, the list uses the market quote if available, then total boxETH required, without labeling the result as profit.

The scanner does not trade or execute `stabilisePeg`. Market prices, gas, target state, and liquidity can change before a transaction is mined.
