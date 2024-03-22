import {
  script,
  payments,
  Psbt,
  opcodes,
  Transaction,
  networks,
} from "bitcoinjs-lib";
import { Taptree } from "bitcoinjs-lib/src/types";

import { internalPubkey } from "./constants/internalPubkey";
import { initBTCCurve } from "./utils/initBTCCurve";
import { UTXO } from "./types/UTXO";

export { initBTCCurve };

// StakingScriptData is a class that holds the data required for the BTC Staking Script
// and exposes methods for converting it into useful formats
export class StakingScriptData {
  stakerKey: Buffer;
  finalityProviderKeys: Buffer[];
  covenantKeys: Buffer[];
  covenantThreshold: number;
  stakingTime: number;
  unbondingTime: number;

  constructor(
    stakerKey: Buffer,
    finalityProviderKeys: Buffer[],
    covenantKeys: Buffer[],
    covenantThreshold: number,
    stakingTime: number,
    unbondingTime: number,
  ) {
    this.stakerKey = stakerKey;
    this.finalityProviderKeys = finalityProviderKeys;
    this.covenantKeys = covenantKeys;
    this.covenantThreshold = covenantThreshold;
    this.stakingTime = stakingTime;
    this.unbondingTime = unbondingTime;
  }

  validate(): boolean {
    // pubKeyLength denotes the length of a public key in bytes
    const pubKeyLength = 32;
    // check that staker key is the correct length
    if (this.stakerKey.length != pubKeyLength) {
      return false;
    }
    // check that finalityProvider keys are the correct length
    if (
      this.finalityProviderKeys.some(
        (finalityProviderKey) => finalityProviderKey.length != pubKeyLength,
      )
    ) {
      return false;
    }
    // check that covenant keys are the correct length
    if (
      this.covenantKeys.some(
        (covenantKey) => covenantKey.length != pubKeyLength,
      )
    ) {
      return false;
    }
    // check that maximum value for staking time is not greater than uint16
    if (this.stakingTime > 65535) {
      return false;
    }
    return true;
  }

  // The staking script allows for multiple finality provider public keys
  // to support (re)stake to multiple finality providers
  // Covenant members are going to have multiple keys

  // Only holder of private key for given pubKey can spend after relative lock time
  // Creates the timelock script in the form:
  // <stakerPubKey>
  // OP_CHECKSIGVERIFY
  // <stakingTimeBlocks>
  // OP_CHECKSEQUENCEVERIFY
  buildTimelockScript(): Buffer {
    return script.compile([
      this.stakerKey,
      opcodes.OP_CHECKSIGVERIFY,
      script.number.encode(this.stakingTime),
      opcodes.OP_CHECKSEQUENCEVERIFY,
    ]);
  }

  // Creates the unbonding timelock script in the form:
  // <stakerPubKey>
  // OP_CHECKSIGVERIFY
  // <unbondingTimeBlocks>
  // OP_CHECKSEQUENCEVERIFY
  buildUnbondingTimelockScript(): Buffer {
    return script.compile([
      this.stakerKey,
      opcodes.OP_CHECKSIGVERIFY,
      script.number.encode(this.unbondingTime),
      opcodes.OP_CHECKSEQUENCEVERIFY,
    ]);
  }

  // Creates the unbonding script of the form:
  // buildSingleKeyScript(stakerPk, true) ||
  // buildMultiKeyScript(covenantPks, covenantThreshold, false)
  // || means combining the scripts
  buildUnbondingScript(): Buffer {
    return Buffer.concat([
      this.buildSingleKeyScript(this.stakerKey, true),
      this.buildMultiKeyScript(
        this.covenantKeys,
        this.covenantThreshold,
        false,
      ),
    ]);
  }

  // Creates the slashing script of the form:
  // buildSingleKeyScript(stakerPk, true) ||
  // buildMultiKeyScript(finalityProviderPKs, 1, true) ||
  // buildMultiKeyScript(covenantPks, covenantThreshold, false)
  // || means combining the scripts
  buildSlashingScript(): Buffer {
    return Buffer.concat([
      this.buildSingleKeyScript(this.stakerKey, true),
      this.buildMultiKeyScript(
        this.finalityProviderKeys,
        // The threshold is always 1 as we only need one
        // finalityProvider signature to perform slashing
        // (only one finalityProvider performs an offence)
        1,
        // OP_VERIFY/OP_CHECKSIGVERIFY is added at the end
        true,
      ),
      this.buildMultiKeyScript(
        this.covenantKeys,
        this.covenantThreshold,
        // No need to add verify since covenants are at the end of the script
        false,
      ),
    ]);
  }

  // Creates the data embed script of the form:
  // OP_RETURN || <serializedStakingData>
  // where serializedStakingData is the concatenation of:
  // MagicBytes || Version || StakerPublicKey || FinalityProviderPublicKey || StakingTime
  buildDataEmbedScript(): Buffer {
    // 4 bytes for magic bytes
    const magicBytes = Buffer.from("01020304", "hex");
    // 1 byte for version
    const version = Buffer.alloc(1);
    version.writeUInt8(0);
    // 2 bytes for staking time
    const stakingTime = Buffer.alloc(2);
    // big endian
    stakingTime.writeUInt16BE(this.stakingTime);
    const serializedStakingData = Buffer.concat([
      magicBytes,
      version,
      this.stakerKey,
      this.finalityProviderKeys[0],
      stakingTime,
    ]);
    return script.compile([opcodes.OP_RETURN, serializedStakingData]);
  }

  // buildScripts returns the BTC staking scripts
  buildScripts(): {
    timelockScript: Buffer;
    unbondingScript: Buffer;
    slashingScript: Buffer;
    unbondingTimelockScript: Buffer;
    dataEmbedScript: Buffer;
  } {
    return {
      timelockScript: this.buildTimelockScript(),
      unbondingScript: this.buildUnbondingScript(),
      slashingScript: this.buildSlashingScript(),
      unbondingTimelockScript: this.buildUnbondingTimelockScript(),
      dataEmbedScript: this.buildDataEmbedScript(),
    };
  }

  // buildSingleKeyScript and buildMultiKeyScript allow us to reuse functionality
  // for creating Bitcoin scripts for the unbonding script and the slashing script

  // buildSingleKeyScript creates a single key script
  // Creates a script of the form:
  // <pk> OP_CHECKSIGVERIFY (if withVerify is true)
  // <pk> OP_CHECKSIG (if withVerify is false)
  buildSingleKeyScript(pk: Buffer, withVerify: boolean): Buffer {
    return script.compile([
      pk,
      withVerify ? opcodes.OP_CHECKSIGVERIFY : opcodes.OP_CHECKSIG,
    ]);
  }

  // buildMultiSigScript creates a multi key script
  // It validates whether provided keys are unique and the threshold is not greater than number of keys
  // If there is only one key provided it will return single key sig script
  // Creates a script of the form:
  // <pk1> OP_CHEKCSIG <pk2> OP_CHECKSIGADD <pk3> OP_CHECKSIGADD ... <pkN> OP_CHECKSIGADD <threshold> OP_GREATERTHANOREQUAL
  // <withVerify -> OP_VERIFY>
  buildMultiKeyScript(
    pks: Buffer[],
    threshold: number,
    withVerify: boolean,
  ): Buffer {
    // Verify that pks is not empty
    if (!pks || pks.length === 0) {
      throw new Error("No keys provided");
    }
    // Verify that threshold <= len(pks)
    if (threshold > pks.length) {
      throw new Error(
        "Required number of valid signers is greater than number of provided keys",
      );
    }
    if (pks.length === 1) {
      return this.buildSingleKeyScript(pks[0], withVerify);
    }
    // keys must be sorted
    const sortedPks = pks.sort(Buffer.compare);
    // verify there are no duplicates
    for (let i = 0; i < sortedPks.length - 1; ++i) {
      if (sortedPks[i].equals(sortedPks[i + 1])) {
        throw new Error("Duplicate keys provided");
      }
    }
    const scriptElements = [sortedPks[0], opcodes.OP_CHECKSIG];
    for (let i = 1; i < sortedPks.length; i++) {
      scriptElements.push(sortedPks[i]);
      scriptElements.push(opcodes.OP_CHECKSIGADD);
    }
    scriptElements.push(script.number.encode(threshold));
    scriptElements.push(opcodes.OP_GREATERTHANOREQUAL);
    if (withVerify) {
      scriptElements.push(opcodes.OP_VERIFY);
    }
    return script.compile(scriptElements);
  }
}

// stakingTransaction constructs a BTC Staking transaction
// - Outputs:
//  - The first one corresponds to the staking script with a certain amount
//  - The second one corresponds to the data embed script
//  - The third one corresponds to the change from spending the amount and the transaction fee
export function stakingTransactionDataEmbed(
  timelockScript: Buffer,
  dataEmbedScript: Buffer,
  unbondingScript: Buffer,
  slashingScript: Buffer,
  amount: number,
  fee: number,
  changeAddress: string,
  inputUTXOs: UTXO[],
  network: networks.Network,
  publicKeyNoCoord?: Buffer,
): Psbt {
  // Create a partially signed transaction
  const psbt = new Psbt({ network });
  // Add the UTXOs provided as inputs to the transaction
  var inputsSum = 0;
  for (var i = 0; i < inputUTXOs.length; ++i) {
    const input = inputUTXOs[i];
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: Buffer.from(input.scriptPubKey, "hex"),
        value: input.value,
      },
      // this is needed only if the wallet is in taproot mode
      ...(publicKeyNoCoord && { tapInternalKey: publicKeyNoCoord }),
    });
    inputsSum += input.value;
  }

  const scriptTree: Taptree = [
    {
      output: slashingScript,
    },
    [{ output: unbondingScript }, { output: timelockScript }],
  ];

  // Create an pay-2-taproot (p2tr) output using the staking script
  const stakingOutput = payments.p2tr({
    internalPubkey,
    scriptTree,
    network,
  });

  // Add the staking output to the transaction
  psbt.addOutput({
    address: stakingOutput.address!,
    value: amount,
  });
  // Add the data embed output to the transaction
  psbt.addOutput({
    script: dataEmbedScript,
    value: 0,
  });

  // Add a change output only if there's any amount leftover from the inputs
  if (inputsSum > amount + fee) {
    psbt.addOutput({
      address: changeAddress,
      value: inputsSum - (amount + fee),
    });
  }

  return psbt;
}

// stakingTransaction constructs a BTC Staking transaction
// - Outputs:
//   - The first one corresponds to the staking script with a certain amount
//   - The second one corresponds to the change from spending the amount and the transaction fee
export function stakingTransaction(
  timelockScript: Buffer,
  unbondingScript: Buffer,
  slashingScript: Buffer,
  amount: number,
  fee: number,
  changeAddress: string,
  inputUTXOs: UTXO[],
  network: networks.Network,
  publicKeyNoCoord?: Buffer,
): Psbt {
  // Create a partially signed transaction
  const psbt = new Psbt({ network });
  // Add the UTXOs provided as inputs to the transaction
  var inputsSum = 0;
  for (var i = 0; i < inputUTXOs.length; ++i) {
    const input = inputUTXOs[i];
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: Buffer.from(input.scriptPubKey, "hex"),
        value: input.value,
      },
      // this is needed only if the wallet is in taproot mode
      ...(publicKeyNoCoord && { tapInternalKey: publicKeyNoCoord }),
    });
    inputsSum += input.value;
  }

  const scriptTree: Taptree = [
    {
      output: slashingScript,
    },
    [{ output: unbondingScript }, { output: timelockScript }],
  ];

  // Create an pay-2-taproot (p2tr) output using the staking script
  const stakingOutput = payments.p2tr({
    internalPubkey,
    scriptTree,
    network,
  });
  psbt.addOutput({
    address: stakingOutput.address!,
    value: amount,
  });
  // Add a change output only if there's any amount leftover from the inputs
  if (inputsSum > amount + fee) {
    psbt.addOutput({
      address: changeAddress,
      value: inputsSum - (amount + fee),
    });
  }

  return psbt;
}

// Delegation is manually unbonded
export function withdrawEarlyUnbondedTransaction(
  unbondingTimelockScript: Buffer,
  slashingScript: Buffer,
  tx: string,
  withdrawalAddress: string,
  withdrawalFee: number,
  network: networks.Network,
  outputIndex: number = 0,
): Psbt {
  const scriptTree: Taptree = [
    {
      output: slashingScript,
    },
    { output: unbondingTimelockScript },
  ];

  return withdrawalTransaction(
    unbondingTimelockScript,
    scriptTree,
    tx,
    withdrawalAddress,
    withdrawalFee,
    network,
    outputIndex,
  );
}

// Delegation is naturally unbonded
export function withdrawTimelockUnbondedTransaction(
  timelockScript: Buffer,
  slashingScript: Buffer,
  unbondingScript: Buffer,
  tx: string,
  withdrawalAddress: string,
  withdrawalFee: number,
  network: networks.Network,
  outputIndex: number = 0,
): Psbt {
  const scriptTree: Taptree = [
    {
      output: slashingScript,
    },
    [{ output: unbondingScript }, { output: timelockScript }],
  ];

  return withdrawalTransaction(
    timelockScript,
    scriptTree,
    tx,
    withdrawalAddress,
    withdrawalFee,
    network,
    outputIndex,
  );
}

// withdrawalTransaction generates a transaction that
// spends the staking output of the staking transaction
export function withdrawalTransaction(
  timelockScript: Buffer,
  scriptTree: Taptree,
  tx: string,
  withdrawalAddress: string,
  withdrawalFee: number,
  network: networks.Network,
  outputIndex: number = 0,
): Psbt {
  // position of time in the timelock script
  const timePosition = 2;
  const decompiled = script.decompile(timelockScript);

  if (!decompiled) {
    throw new Error("Timelock script is not valid");
  }

  let timelock = 0;

  // if the timelock is a buffer, it means it's a number bigger than 16 blocks
  if (typeof decompiled[timePosition] !== "number") {
    const timeBuffer = decompiled[timePosition] as Buffer;
    timelock = script.number.decode(timeBuffer);
  } else {
    // in case timelock is <= 16 it will be a number, not a buffer
    const wrap = decompiled[timePosition] % 16;
    timelock = wrap === 0 ? 16 : wrap;
  }

  const convertedTX = Transaction.fromHex(tx);

  const redeem = {
    output: timelockScript,
    redeemVersion: 192,
  };

  const p2tr = payments.p2tr({
    internalPubkey,
    scriptTree,
    redeem,
    network,
  });

  const tapLeafScript = {
    leafVersion: redeem.redeemVersion,
    script: redeem.output,
    controlBlock: p2tr.witness![p2tr.witness!.length - 1],
  };

  const psbt = new Psbt({ network });

  // only transactions with version 2 can trigger OP_CHECKSEQUENCEVERIFY
  // https://github.com/btcsuite/btcd/blob/master/txscript/opcode.go#L1174
  psbt.setVersion(2);

  psbt.addInput({
    hash: convertedTX.getHash(),
    index: outputIndex,
    tapInternalKey: internalPubkey,
    witnessUtxo: {
      value: convertedTX.outs[outputIndex].value,
      script: convertedTX.outs[outputIndex].script,
    },
    tapLeafScript: [tapLeafScript],
    sequence: timelock,
  });

  psbt.addOutput({
    address: withdrawalAddress,
    value: convertedTX.outs[outputIndex].value - withdrawalFee,
  });

  return psbt;
}

// slashingTransaction generates a transaction that
// spends the staking output of the staking transaction
// Outputs:
//   - The first one sends input * slashing_rate funds to the slashing address
//   - The second one sends input * (1-slashing_rate) - fee funds back to the user’s address
export function slashingTransaction(
  scriptTree: Taptree,
  redeemOutput: Buffer,
  transaction: Transaction,
  slashingAddress: string,
  slashingRate: number,
  changeScript: Buffer,
  minimumFee: number,
  network: networks.Network,
): Psbt {
  const redeem = {
    output: redeemOutput,
    redeemVersion: 192,
  };

  const p2tr = payments.p2tr({
    internalPubkey,
    scriptTree,
    redeem,
    network,
  });

  const tapLeafScript = {
    leafVersion: redeem.redeemVersion,
    script: redeem.output,
    controlBlock: p2tr.witness![p2tr.witness!.length - 1],
  };

  const psbt = new Psbt({ network });
  psbt.addInput({
    hash: transaction.getHash(),
    index: 0,
    tapInternalKey: internalPubkey,
    witnessUtxo: {
      value: transaction.outs[0].value,
      script: transaction.outs[0].script,
    },
    tapLeafScript: [tapLeafScript],
  });

  const userValue = transaction.outs[0].value * (1 - slashingRate) - minimumFee;

  // We need to verify that this is above 0
  if (userValue <= 0) {
    // If it is not, then an error is thrown and the user has to stake more
    throw new Error("Not enough funds to slash, stake more");
  }

  // Add the slashing output
  psbt.addOutput({
    address: slashingAddress,
    value: transaction.outs[0].value * slashingRate,
  });

  // Change output contains unbonding timelock script
  const changeOutput = payments.p2tr({
    internalPubkey,
    scriptTree: { output: changeScript },
    network,
  });

  // Add the change output
  psbt.addOutput({
    address: changeOutput.address!,
    value: transaction.outs[0].value * (1 - slashingRate) - minimumFee,
  });

  return psbt;
}

export function unbondingTransaction(
  unbondingScript: Buffer,
  unbondingTimelockScript: Buffer,
  timelockScript: Buffer,
  slashingScript: Buffer,
  stakingTx: Transaction,
  transactionFee: number,
  network: networks.Network,
): Psbt {
  // Build input tapleaf script
  const inputScriptTree: Taptree = [
    {
      output: slashingScript,
    },
    [{ output: unbondingScript }, { output: timelockScript }],
  ];

  const inputRedeem = {
    output: unbondingScript,
    redeemVersion: 192,
  };

  const p2tr = payments.p2tr({
    internalPubkey,
    scriptTree: inputScriptTree,
    redeem: inputRedeem,
    network,
  });

  const inputTapLeafScript = {
    leafVersion: inputRedeem.redeemVersion,
    script: inputRedeem.output,
    controlBlock: p2tr.witness![p2tr.witness!.length - 1],
  };

  const psbt = new Psbt({ network });
  psbt.addInput({
    hash: stakingTx.getHash(),
    index: 0,
    tapInternalKey: internalPubkey,
    witnessUtxo: {
      value: stakingTx.outs[0].value,
      script: stakingTx.outs[0].script,
    },
    tapLeafScript: [inputTapLeafScript],
  });

  // Build output tapleaf script
  const outputScriptTree: Taptree = [
    {
      output: slashingScript,
    },
    { output: unbondingTimelockScript },
  ];

  const unbondingOutput = payments.p2tr({
    internalPubkey,
    scriptTree: outputScriptTree,
    network,
  });

  // Add the unbonding output
  psbt.addOutput({
    address: unbondingOutput.address!,
    value: stakingTx.outs[0].value - transactionFee,
  });

  return psbt;
}

// this function is used to create witness for unbonding transaction
export const createWitness = (
  originalWitness: Buffer[],
  paramsCovenants: Buffer[],
  covenantSigs: {
    btc_pk_hex: string;
    sig_hex: string;
  }[],
) => {
  // map API response to Buffer values
  const covenantSigsBuffers = covenantSigs.map((sig) => ({
    btc_pk_hex: Buffer.from(sig.btc_pk_hex, "hex"),
    sig_hex: Buffer.from(sig.sig_hex, "hex"),
  }));
  // we need covenant from params to be sorted in reverse order
  const paramsCovenantsSorted = [...paramsCovenants]
    .sort(Buffer.compare)
    .reverse();
  const composedCovenantSigs = paramsCovenantsSorted.map((covenant) => {
    // in case there's covenant with this btc_pk_hex we return the sig
    // otherwise we return empty Buffer
    const covenantSig = covenantSigsBuffers.find(
      (sig) => sig.btc_pk_hex.compare(covenant) === 0,
    );
    return covenantSig?.sig_hex || Buffer.alloc(0);
  });
  return [...composedCovenantSigs, ...originalWitness];
};
