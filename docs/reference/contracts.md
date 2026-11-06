## Ethereum mainnet addresses

These are the addresses configured by the current interface. The two CDPs are independent deployments. Verify the chain, full address, and current verified code before signing a transaction or using another interface.

| Component | Address | Explorer |
| --- | --- | --- |
| CDP v1 | `0x7f0A0C7149a46Bf943cCd412da687144b49C6014` | [Verified code](https://etherscan.io/address/0x7f0A0C7149a46Bf943cCd412da687144b49C6014#code) |
| CDP v1.1 | `0x6ffD098E92B606b2947b89A08911C00ca06890FA` | [Verified code](https://etherscan.io/address/0x6ffD098E92B606b2947b89A08911C00ca06890FA#code) |
| boxETH | `0x7690202e2C2297bcD03664e31116d1dFfE7e3B73` | [Verified code](https://etherscan.io/address/0x7690202e2C2297bcD03664e31116d1dFfE7e3B73#code) |
| stETH | `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` | [Lido contract](https://etherscan.io/address/0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84#code) |
| boxFEE | `0xE4B91fAf8810F8895772E7cA065D4CB889120f94` | [Verified code](https://etherscan.io/address/0xE4B91fAf8810F8895772E7cA065D4CB889120f94#code) |
| Fee staking | `0x320c871b6f7721083604FfdD8070E64c1d3c5d7C` | [Verified code](https://etherscan.io/address/0x320c871b6f7721083604FfdD8070E64c1d3c5d7C#code) |
| Peg Stability Module | `0x24146D1B3339Cf76b455dC42e71Ea5Cdff4aE0d7` | [Verified code](https://etherscan.io/address/0x24146D1B3339Cf76b455dC42e71Ea5Cdff4aE0d7#code) |
| Treasury multisig | `0x98e6475C01D018Ae78c02ef48738f687538226Af` | [Address](https://etherscan.io/address/0x98e6475C01D018Ae78c02ef48738f687538226Af) |

## What the interface uses these for

The selected CDP handles stETH collateral, boxETH debt, version-specific yield settlement, and direct `stabilisePeg` redemption. boxETH is the debt token. boxFEE is backed by boxETH in a vault; the fee-staking contract accepts boxFEE and pays rewards in boxETH. The PSM receives the friction fee configured by the selected CDP; v1.1 exposes a mutable PSM setting, so the app reads the current recipient.

The app is configured for chain ID 1 and reads live balances and settings from a public Ethereum RPC. A source-verified address is not an audit or a guarantee of contract safety. Review [approvals](../approvals/) and the [current contract behavior guide](../../deployed-behavior/) before interacting.
