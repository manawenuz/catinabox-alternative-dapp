## What can change

The deployed CDPs expose role-controlled fee configuration, and the v1.1 PSM recipient can be changed by an administrator. These settings mean older claims that every parameter is permanently fixed should not be treated as a description of the current deployments. The app does not include an administrator dashboard or setter controls.

At block **26,354,277** (2026-11-06 07:20:47 UTC), both CDPs reported `idleFee = 10` and `ltv() = 9900` (99%). Those values describe that block. The app reads current settings from the selected contract instead of using that snapshot as live configuration.

## Fee controls

The v1 deployment initializes `idleFee` to 1 and its admin setter caps it at 75. The v1.1 deployment initializes the same setting to 1 and its setter allows up to 99. These values are percentages in the contracts' integer representation. V1 also adds a debt-to-deposit term to its yield fee formula; v1.1 uses the configured idle fee when its distribution conditions are met. See [version behavior](../v1-1/) for the formulas.

## PSM recipient

The `psm()` getter identifies where the CDP sends the boxETH friction fee during direct redemption. The v1.1 setting is mutable, so the interface reads and displays its current value before signing. Confirm the recipient shown in the review and compare it with the transfer in the transaction receipt.

## User-level repayment flag

`setRepayFlag(bool)` is a position-level setting, not an administrator fee control. It changes how accrued CDP yield is handled when the position is settled. The current app uses that state in its settlement projection but does not expose a control for changing it.

This page documents the deployed methods and dated observations. It does not infer a complete governance model from a limited ABI or a historical project roadmap. Check verified code, role assignments, and live getters for the deployment you are reviewing.
