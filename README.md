<p align="center">
    <img alt="Babylon Logo" src="assets/logo.png" width="100" />
    <h3 align="center">btc-staking-ts</h3>
    <p align="center">Babylon Bitcoin Staking Protocol</p>
    <p align="center"><strong>TypeScript</strong> library</p>
    <p align="center">
        <a href="https://github.com/babylonchain/btc-staking-ts/releases">
            <img src="https://img.shields.io/badge/version-0.0.1-FF7C2B">
        </a>
    </p>
</p>
<br/>

## Installation

```console
npm i btc-staking-ts
```

## Usage

### Get input data

```ts
import { networks } from "bitcoinjs-lib";

// public key associated with the wallet, without the coordinate, Buffer
const stakerPk: Buffer = btcWallet.publicKeyNoCoord();

// A list of public keys without the coordinate bytes corresponding to the finality providers
// the stake will be delegated to.
// Currently, Babylon does not support restaking, so this should contain only a single item. Buffer[]
const finalityProviders: Buffer[] = [
  Buffer.from(finalityProvider.btc_pk_hex, "hex"),
];

// A list of the public keys without the coordinate bytes corresponding to the covenant emulators.
// This is a parameter of the Babylon system and should be retrieved from there. Buffer[]
const covenantPks: Buffer[] = covenant_pks.map((pk) => Buffer.from(pk, "hex"));

// The number of covenant emulator signatures required for a transaction to be valid.
// This is a parameter of the Babylon system and should be retrieved from there. number
const covenantThreshold: number = 3;

// The staking period in BTC blocks. number
const stakingDuration: number = 144;

// The unbonding period in BTC blocks.
// This value should be more than equal than the minimum unbonding time of the Babylon system. number
const minUnbondingTime: number = 101;

// Each object in the inputUTXOs array represents a single UTXO with the following properties:
// - txid: transaction ID, string
// - vout: output index, number
// - value: value of the UTXO, in satoshis, number
// - scriptPubKey: script which provides the conditions that must be fulfilled for this UTXO to be spent, string
const inputUTXOs = [
  {
    txid: "e472d65b0c9c1bac9ffe53708007e57ab830f1bf09af4bfbd17e780b641258fc",
    vout: 2,
    value: 9265692,
    scriptPubKey: "0014505049839bc32f869590adc5650c584e17c917fc",
  },
];

// Staking amount in satoshis. number
const stakingAmount: number = 1000;

// Staking fee in satoshis. number
const stakingFee: number = 500;

// BTC wallet change address, Taproot or Native SegWit. string
const changeAddress: string = btcWallet.address;

// network to work with, either networks.testnet for BTC Testnet and BTC Signet, or networks.bitcoin for BTC Mainnet
const network = networks.testnet;
```

### Create Staking Script Data

```ts
import { StakingScriptData } from "btc-staking-ts";

const stakingScriptData = new StakingScriptData(
  stakerPk,
  finalityProviders,
  covenantPks,
  covenantThreshold,
  stakingDuration,
  minUnbondingTime,
);
```

### Create Staking Scripts

To build the Bitcoin Staking scripts, you can

```ts
const {
  timelockScript,
  unbondingScript,
  slashingScript,
  dataEmbedScript,
  unbondingTimelockScript,
} = stakingScriptData.buildScripts();
```

The above scripts correspond to the following:

- `timelockScript`: A script that allows the Bitcoin to be retrieved only through the staker's signature and the staking period being expired.
- `unbondingScript`: The script that allows on-demand unbonding. Requires the staker's signature and the covenant committee's signatures.
- `slashingScript`: The script that enables slashing. It requires the staker's signature and in this phase the staker should not sign it.
- `dataEmbedScript`: An OP_RETURN script containing all required data to be able to identify and verify the transaction as a staking transaction.

### Create unsigned staking transaction

```ts
import { stakingTransaction } from "btc-staking-ts";
import { Psbt } from "bitcoinjs-lib";

// stakingTransaction constructs an unsigned BTC Staking transaction
const unsignedStakingTx: Psbt = stakingTransaction(
  timelockScript,
  unbondingScript,
  slashingScript,
  stakingAmount,
  stakingFee,
  changeAddress,
  inputUTXOs,
  network(),
  btcWallet.isTaproot ? btcWallet.publicKeyNoCoord() : undefined,
  dataEmbedScript,
);
```

Public key is needed only if the wallet is in Taproot mode, for `tapInternalKey`

### Sign staking transaction

```ts
import { Psbt, Transaction } from "bitcoinjs-lib";

const stakingTx: Promise<Transaction> = await btcWallet.signTransaction(unsignedStakingTx: Psbt);
```

### Create slashing transaction

First, create the slashing script tree and get the input parameters

```ts
import { Taptree } from "bitcoinjs-lib/src/types";

const slashingScriptTree: Taptree = [
  {
    output: slashingScript,
  },
  [{ output: unbondingScript }, { output: timelockScript }],
];

// These are parameters of the Babylon system and should be retrieved from there:

// Slashing address. string
const slashingAddress: string = "";
// Slashing rate. number
const slashingRate: number = 0;
// Slashing fee in satoshis. number
const minimumSlashingFee: number = 500;
```

Then create unsigned slashing transaction

```ts
import { slashingTransaction } from "btc-staking-ts";

const unsignedSlashingTx: Psbt = slashingTransaction(
  slashingScriptTree,
  slashingScript,
  stakingTx,
  slashingAddress,
  slashingRate,
  unbondingTimelockScript,
  minimumSlashingFee,
  network,
);
```

### Sign slashing transaction

```ts
import { Psbt, Transaction } from "bitcoinjs-lib";

const slashingTx: Promise<Transaction> = await btcWallet.signTransaction(unsignedSlashingTx: Psbt);
```

### Create unbonding transaction

```ts
import { unbondingTransaction } from "btc-staking-ts";

// Unbonding fee in satoshis. number
const unbondingFee: number = 500;

const unsignedUnbondingTx: Psbt = unbondingTransaction(
  unbondingScript,
  unbondingTimelockScript,
  timelockScript,
  slashingScript,
  stakingTx,
  unbondingFee,
  network,
);
```

### Sign unbonding transaction

```ts
import { Psbt, Transaction } from "bitcoinjs-lib";

const unbondingTx: Promise<Transaction> = await btcWallet.signTransaction(unsignedUnbondingTx: Psbt);
```

### Create unbonding slashing transaction

First, create the unbonding script tree and get the input parameters

```ts
const unbondingScriptTree: Taptree = [
  {
    output: slashingScript,
  },
  { output: unbondingTimelockScript },
];
```

Then create unsigned unbonding slashing transaction

```ts
import { Psbt } from "bitcoinjs-lib";
import { slashingTransaction } from "btc-staking-ts";

const unsignedUnbondingSlashingTx: Psbt = slashingTransaction(
  unbondingScriptTree,
  slashingScript,
  unbondingTx,
  slashingAddress,
  slashingRate,
  unbondingTimelockScript,
  minimumSlashingFee,
  network,
);
```

And sign the transaction

```ts
import { Psbt, Transaction } from "bitcoinjs-lib";

const unbondingSlashingTx: Promise<Transaction> = await btcWallet.signTransaction(unsignedUnbondingSlashingTx: Psbt);
```

### Unbonding

To unbond, you need to:

1. Recreate the unbonding transaction the same way you initially created it
2. Create covenant signatures

```ts
const witness = createWitness(
  unbondingTx.ins[0].witness: Buffer[], // original witness
  covenantPks: Buffer[],
  covenantUnbondingSignatures: {
    btc_pk_hex: string;
    sig_hex: string;
  }[],
);
```

3. Put the signatures

```ts
unbondingTx.setWitness(0, witness);
```

### Withdrawing

To withdraw, you need to:

1. Create general inputs

```ts
// index of the staking output in a transaction. number
const stakingOutputIndex: number = 0;
// withdrawal fee in satoshis. number
const withdrawalFee: number = 500;
// withdrawal address. string
const withdrawalAddress: string = btcWallet.address;
```

3. If delegation unbonded manually

```ts
import { Psbt } from "bitcoinjs-lib";
import { withdrawEarlyUnbondedTransaction } from "btc-staking-ts";

// unbonding transaction hex. string
const unbondingTxHex: string = "";

const unsignedWithdrawalTx: Psbt = withdrawEarlyUnbondedTransaction(
  unbondingTimelockScript,
  slashingScript,
  unbondingTxHex,
  withdrawalAddress,
  withdrawalFee,
  network,
  stakingOutputIndex,
);
```

3. If delegation unbonded naturally / expired

```ts
import { Psbt } from "bitcoinjs-lib";
import { withdrawTimelockUnbondedTransaction } from "btc-staking-ts";

// staking transaction hex. string
const stakingTxHex: string = "";

const unsignedWithdrawalTx = withdrawTimelockUnbondedTransaction(
  timelockScript,
  slashingScript,
  unbondingScript,
  stakingTxHex,
  btcWallet.address,
  withdrawalFee,
  network,
  stakingOutputIndex,
);
```
