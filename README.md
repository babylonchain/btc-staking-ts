# btc-staking-ts

## Installation

```console
npm i btc-staking-ts
```

## Usage

### Get input UTXOs

```ts
const inputUTXOs = await mempoolApi.getFundingUTXOs(
  btcWallet.address,
  stakingAmount + stakingFee,
);
```

### Create Staking Script Data

```ts
import { StakingScriptData } from "btc-staking-ts";

const stakingScriptData = new StakingScriptData(
  btcWallet.publicKeyNoCoord(),
  [Buffer.from(finalityProvider.btc_pk_hex, "hex")],
  covenantPKsBuffer,
  btcStakingParams.covenant_quorum,
  stakingDuration,
  btcStakingParams.min_unbonding_time + 1,
);
```

### Create Staking Scripts

```ts
const { timelockScript, dataEmbedScript, unbondingScript, slashingScript } =
  stakingScriptData.buildScripts();
```

### Create unsigned staking transaction

```ts
import { stakingTransaction } from "btc-staking-ts";

const unsignedStakingTx = stakingTransaction(
  timelockScript,
  unbondingScript,
  slashingScript,
  stakingAmount,
  stakingFee,
  btcWallet.address,
  inputUTXOs,
  btcWallet.btclibNetwork(),
  btcWallet.isTaproot ? btcWallet.publicKeyNoCoord() : undefined,
  dataEmbedScript,
);
```

### Sign staking transaction

```ts
const stakingTx = await btcWallet.signTransaction(unsignedStakingTx);
```
