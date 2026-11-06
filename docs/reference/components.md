## Mainnet components

Cat-in-a-Box uses several contracts with separate responsibilities. The addresses configured by this interface are listed in the [contract directory](../contracts/). Confirm current code and live settings before interacting directly.

### CDP v1 and v1.1

Each collateralized debt position contract tracks stETH deposits and boxETH debt, applies its collateral limit, and settles excess stETH through version-specific points accounting. The app can read a position and system totals, simulate deposit, borrow, repay, and withdrawal calls, and submit them through a connected wallet. V1 and v1.1 accounting rules differ; a version selector does not combine their state.

The `stabilisePeg(amount, depositor)` method is also permissionless. It applies a debt cap and friction fee, updates the selected target position, and transfers collateral to the caller. See [v1 and v1.1](../v1-1/) and [resolution](../resolve/).

### stETH and boxETH

stETH is the collateral token used by the deployed CDPs. boxETH is the synthetic ERC-20 debt token. Borrowing, market purchases, and direct CDP redemption are different operations: the first mints debt, the second trades at an external quote, and the third burns boxETH while reducing a position.

The deployed boxETH `burnFrom` checks allowance but can leave the approved amount in place after burning. The app shows and can revoke a remaining allowance after repayment or redemption.

### Peg Stability Module

The CDP's `psm()` value identifies the recipient of the boxETH friction fee on direct redemption. During auto-repay settlement, the CDP can also transfer collateral to its PSM address while reducing debt. The interface reads the configured redemption recipient live because the v1.1 PSM setting is mutable.

The PSM address is not a promise of a general-purpose swap pool. Verify the recipient and contract method in the transaction review.

### boxFEE vault and fee staking

The boxFEE contract holds boxETH as its vault asset and issues boxFEE shares. `totalAssets()` and `convertToAssets()` expose the current contract accounting; this ratio is not a market quote. Some entrypoints behave differently from the usual ERC-4626 preview convention, as detailed in the [boxFEE guide](../tokenomics/).

The fee-staking contract accepts boxFEE as stake collateral. Its configured reward token is boxETH, distributed through points accounting. The user claim operation is `poke(account)`. Its `trade` method is restricted to the converter role and is not a user-facing swap.

### External market routes

Uniswap v3 pools and quotes are external to the CDP contracts. The optional redemption scanner can read direct boxETH/stETH and boxETH/WETH/stETH routes through QuoterV2. It is read-only and does not execute swaps.
