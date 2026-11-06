## Allowances used by the app

An ERC-20 allowance lets a spender transfer tokens from your wallet up to the approved amount. The app requests an exact allowance for the operation when the current allowance is too small. Approving and executing are separate transactions, and an approval can remain if the later action is cancelled or fails.

| Operation | Token approved | Spender |
| --- | --- | --- |
| Deposit stETH | stETH | Selected CDP v1 or v1.1 |
| Repay boxETH | boxETH | Selected CDP v1 or v1.1 |
| Redeem through `stabilisePeg` | boxETH, including the friction fee | Selected CDP v1 or v1.1 |
| Deposit or mint boxFEE shares | boxETH | boxFEE vault |
| Stake boxFEE | boxFEE | Fee-staking contract |

Borrowing and withdrawal do not require a token allowance from the wallet. Unstaking and claiming rewards do not require a new allowance. For boxFEE operations, the vault has non-standard entrypoint behavior; see [boxFEE accounting](../tokenomics/).

## Residual boxETH allowance

The deployed boxETH `burnFrom` checks that allowance is sufficient but writes the same value back instead of subtracting the burned amount. Repayment can therefore leave the approved amount in place. Redemption first transfers its boxETH friction fee with `transferFrom`, then burns the requested amount with `burnFrom`; a residual allowance can remain after both steps.

The app requests only the exact amount needed, refreshes the allowance after execution, displays any remainder, and provides a revoke action. Review the token, spender, and amount shown in the wallet. You can also revoke an allowance by approving zero to that spender.

## Review checklist

- Confirm you are on Ethereum mainnet and selected the correct CDP version.
- Confirm the token and spender address match the [contract directory](../contracts/).
- Check the requested amount, including the redemption fee when applicable.
- Treat an approval as independent from the follow-up protocol transaction.
- After completion or cancellation, inspect allowances and revoke any approval you no longer want.
