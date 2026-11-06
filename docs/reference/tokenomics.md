## boxFEE as a boxETH-backed vault share

The deployed boxFEE contract holds boxETH as its asset. `totalAssets()` reads the vault's boxETH balance, and `convertToAssets(shares)` provides a contract conversion based on current assets and share supply. This is an on-chain accounting ratio, not a DEX price, a guaranteed exit value, or a measure of immediately available market liquidity.

At block **26,355,994** (2026-11-06 13:04:35 UTC), one boxFEE converted to approximately **0.1062729535 boxETH**. This is a historical snapshot only. Use the live contract value for a current estimate and the transaction receipt for an executed deposit, withdrawal, mint, or redemption.

## Entry and exit calls

The deployed `deposit(assets, receiver)` and `mint(shares, receiver)` entrypoints transfer and issue the same nominal amount. That differs from the usual ERC-4626 expectation that minting an exact share amount can require a different asset amount. Their return variables are not set to the transferred or issued amount, so the app reads the conversion separately instead of presenting the return value as a preview.

For exits, `withdraw(assets, receiver, owner)` calculates shares to burn with `previewWithdraw`, which rounds up. `redeem(shares, receiver, owner)` pays `previewRedeem(shares)`, which uses the live conversion and rounds down. Rounding and state changes affect the final amount.

## Staking rewards

The fee-staking contract accepts boxFEE as stake collateral and pays its configured reward token, which is boxETH in the deployed setup. The contract distributes rewards pro rata through points accounting. The app supports stake, unstake, and claim; claiming calls `poke(wallet)`. Claiming can sync new rewards as well as pay the amount already shown as owing.

Staking rewards are separate from stETH yield accounted by a CDP. Neither system promises a fixed APR. The current interface does not show a guaranteed future yield or a guaranteed market exit price.

## What this page does not claim

Historical sale plans, liquidity roadmaps, and projected backing in the original documentation are not current contract guarantees. Verify the deployed vault balance, share supply, reward token, and market liquidity at the time of use. See the [contract directory](../contracts/) and [deployed behavior guide](../../deployed-behavior/).
