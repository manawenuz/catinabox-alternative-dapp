## Separate contract accounting from market price

There is no single conversion that answers every valuation question for boxETH or boxFEE. Use the event, contract method, and market quote that match the transaction being reviewed, at the relevant block or time.

### boxETH traded on a market

For a DEX swap, the execution price and amounts come from the transaction receipt and pool state at that time. A later spot price or current pool quote does not establish the value of an earlier trade. Preserve the transaction hash, block, token amounts, fee, and any separate gas cost.

### boxETH redeemed through a CDP

`stabilisePeg` burns the processed boxETH amount and transfers the same nominal amount of stETH to the caller, while an additional friction fee is paid in boxETH to the PSM. The processed amount is capped at one quarter of target debt. The target and fee use state at execution; use the receipt and event logs to record what actually happened.

### boxFEE vault conversion

`convertToAssets(shares)` reports the vault's on-chain boxETH conversion for a given share amount. It is not the DEX price of boxFEE, a guaranteed exit value, or a historical conversion for a past transaction. For an actual withdrawal or redemption, use the transaction receipt and the contract's preview and rounding behavior.

### Records and tax treatment

Keep contemporaneous transaction records and follow the rules that apply in the relevant jurisdiction. This page explains protocol data only; it does not determine taxable value or provide tax advice. Consult a qualified tax professional for jurisdiction-specific treatment.
