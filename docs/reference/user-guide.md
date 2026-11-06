## Before you start

The interface reads Ethereum mainnet contracts and asks an injected wallet to sign writes. Connect a wallet on chain ID 1, choose v1 or v1.1, and confirm the selected contract address and token amount in each wallet prompt. The two CDP versions are separate; select the version where your position already exists.

The app reads live balances and settings, previews the action, and simulates the call before the transaction prompt. Chain state can still change before a transaction is included. A token approval is a separate transaction from the protocol action.

## Deposit stETH

1. Select the CDP version and open **Deposit**.
2. Enter a positive stETH amount or choose **MAX**.
3. Review the selected CDP address, amount, balance, approval requirement, and preview block.
4. If needed, approve the exact amount of stETH for that CDP, then confirm the deposit transaction.

The contract records the deposit as collateral for the selected position. The current interface can display a remaining stETH allowance and lets you revoke it.

## Borrow boxETH

1. Open **Borrow** for the same CDP version.
2. Check the displayed borrow capacity and the live contract collateral limit.
3. Review any v1.1 mint fee shown in the estimate, then confirm the CDP transaction.

V1.1 can add a fee to debt using the live `mintingFee()` value. V1 does not use that mint fee. The app reads the current value instead of treating a release label or old documentation figure as configuration.

## Repay boxETH

1. Open **Repay** for the CDP that holds the debt.
2. Enter an amount no greater than the refreshed debt after the app's yield-settlement projection.
3. Approve boxETH for the selected CDP if necessary, then confirm repayment.

The app re-reads the repayment cap after approval and simulates before the final wallet prompt. The deployed boxETH `burnFrom` implementation can leave an allowance behind after a burn. The interface shows the remaining allowance and offers **Revoke allowance**.

## Withdraw stETH

Enter an amount within the current withdrawable balance. The CDP enforces its collateral requirement when the call executes; the preview can become stale if contract state changes. Review the amount and target version in your wallet.

## Yield settlement and auto-repay

CDP yield is settled as part of selected contract actions. If the position's `enableRepaying` flag is on and accrued owing does not exceed the debt, settlement can reduce debt. In other cases, the contract increases the position's deposited amount. This is separate from boxFEE staking rewards.

The current interface uses the flag when projecting settlement but does not provide a control for changing it. The contract exposes `setRepayFlag(bool)`; calling it directly is an on-chain action and requires verifying the target contract and wallet calldata.

## boxFEE and fee staking

The **boxFEE** panel supports deposit, mint, withdraw, and redeem. Deposit and mint use boxETH as the vault asset; the deployed entrypoints move the same nominal amount and differ from typical ERC-4626 preview expectations. Review the live conversion separately from any market price.

The **Stake** panel lets you stake or unstake boxFEE and claim rewards. Staking requires a boxFEE allowance to the fee-staking contract. Rewards are boxETH and the claim call is `poke(wallet)`. Review the [boxFEE guide](../tokenomics/) and [approval guide](../approvals/) before using these operations.

## Redeem boxETH for stETH

The **Redeem** panel accepts a target depositor and requested boxETH amount. The CDP's `stabilisePeg(amount, depositor)` burns boxETH, sends a friction fee in boxETH to the live PSM recipient, reduces the target's debt and collateral by the processed amount, and transfers the same nominal amount of stETH to the caller. The contract caps a call at one quarter of the target's debt after settlement.

There is no minimum-output parameter in the contract call. Review the target address, current cap, exact fee, total boxETH requirement, PSM recipient, quote, and gas estimate. A target may belong to someone else; this changes that position. See the [resolution guide](../resolve/) for scanner limits and transaction details.

## Transaction history and allowances

Successful operations show a transaction link and refreshed state. Check residual allowance after CDP repayment, deposit, or redemption and revoke it if you no longer want it. Wallet approval dialogs are the final authority for the contract address and calldata you are signing.
