import { script, payments, Psbt, Transaction, networks } from "bitcoinjs-lib";
import { Taptree } from "bitcoinjs-lib/src/types";

import { internalPubkey } from "./constants/internalPubkey";
import { initBTCCurve } from "./utils/curve";
import { StakingScriptData } from "./utils/stakingScript";
import { UTXO } from "./types/UTXO";

export { initBTCCurve, StakingScriptData };

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
