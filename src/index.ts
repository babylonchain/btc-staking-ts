import {
  script,
  payments,
  Psbt,
  Transaction,
  networks,
  address,
} from "bitcoinjs-lib";
import { Taptree } from "bitcoinjs-lib/src/types";

import { internalPubkey } from "./constants/internalPubkey";
import { initBTCCurve } from "./utils/curve";
import { PK_LENGTH, StakingScriptData } from "./utils/stakingScript";
import { UTXO } from "./types/UTXO";
import { getEstimatedFee } from "./utils/fee";

export { initBTCCurve, StakingScriptData };

// https://bips.xyz/370
const BTC_LOCKTIME_HEIGHT_TIME_CUTOFF = 500000000;

// stakingTransaction constructs an unsigned BTC Staking transaction
// - Outputs:
//   - psbt: 
//      - The first one corresponds to the staking script with a certain amount
//      - The second one corresponds to the change from spending the amount and the transaction fee
//      - In case of data embed script, it will be added as the second output, fee as the third
//   - fee: The fee amount of the transaction
// - Inputs:
//   - scripts: timelockScript, unbondingScript, slashingScript: Scripts for different transaction types
//     and dataEmbedScript: Optional data embed script
//   - amount, fee: Amount to stake and transaction fee
//   - changeAddress: Address to send the change to
//   - inputUTXOs: UTXOs to use as inputs for the transaction
//   - network: Bitcoin network
//   - publicKeyNoCoord: Public key if the wallet is in taproot mode
//   - lockHeight: Optional block height locktime to set for the transaction. i.e not mined until block height
export function stakingTransaction(
  scripts: {
    timelockScript: Buffer,
    unbondingScript: Buffer,
    slashingScript: Buffer,
    dataEmbedScript?: Buffer,
  },
  amount: number,
  changeAddress: string,
  inputUTXOs: UTXO[],
  network: networks.Network,
  feeRate: number,
  publicKeyNoCoord?: Buffer,
  lockHeight?: number,
): { psbt: Psbt, fee: number } {
  // Check that amount and fee are bigger than 0
  if (amount <= 0 || feeRate <= 0) {
    throw new Error("Amount and fee rate must be bigger than 0");
  }

  // Check whether the change address is a valid Bitcoin address.
  if (!address.toOutputScript(changeAddress, network)) {
    throw new Error("Invalid change address");
  }

  // Check whether the public key is valid
  if (publicKeyNoCoord && publicKeyNoCoord.length !== PK_LENGTH) {
    throw new Error("Invalid public key");
  }

  // Create a partially signed transaction
  const psbt = new Psbt({ network });
  // Add the UTXOs provided as inputs to the transaction
  let inputsSum = 0;
  for (let i = 0; i < inputUTXOs.length; ++i) {
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
      sequence: 0xfffffffd, // Enable locktime by setting the sequence value to (RBF-able)
    });
    inputsSum += input.value;
  }

  const scriptTree: Taptree = [
    {
      output: scripts.slashingScript,
    },
    [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }],
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

  if (scripts.dataEmbedScript) {
    // Add the data embed output to the transaction
    psbt.addOutput({
      script: scripts.dataEmbedScript,
      value: 0,
    });
  }

  const outputSize = psbt.txOutputs.length + 1
  const fee = getEstimatedFee(feeRate, inputUTXOs.length, outputSize);
  // Check whether inputSum is enough to satisfy the staking amount
  if (inputsSum < amount + fee) {
    throw new Error("Insufficient funds");
  }

  // Add a change output only if there's any amount leftover from the inputs
  if (inputsSum > amount + fee) {
    psbt.addOutput({
      address: changeAddress,
      value: inputsSum - (amount + fee),
    });
  }


  // Set the locktime field if provided. If not provided, the locktime will be set to 0 by default
  // Only height based locktime is supported
  if (lockHeight) {
    if (lockHeight >= BTC_LOCKTIME_HEIGHT_TIME_CUTOFF) {
      throw new Error("Invalid lock height");
    }
    psbt.setLocktime(lockHeight);
  }

  return {
    psbt,
    fee
  };
}

// Delegation is manually unbonded
export function withdrawEarlyUnbondedTransaction(
  scripts: {
    unbondingTimelockScript: Buffer,
    slashingScript: Buffer,
  },
  tx: Transaction,
  withdrawalAddress: string,
  feeRate: number,
  network: networks.Network,
  outputIndex: number = 0,
): {
  psbt: Psbt,
  fee: number
} {
  const scriptTree: Taptree = [
    {
      output: scripts.slashingScript,
    },
    { output: scripts.unbondingTimelockScript },
  ];

  return withdrawalTransaction(
    {
      timelockScript: scripts.unbondingTimelockScript,
    },
    scriptTree,
    tx,
    withdrawalAddress,
    network,
    feeRate,
    outputIndex,
  );
}

// Delegation is naturally unbonded
export function withdrawTimelockUnbondedTransaction(
  scripts: {
    timelockScript: Buffer,
    slashingScript: Buffer,
    unbondingScript: Buffer,
  },
  tx: Transaction,
  withdrawalAddress: string,
  network: networks.Network,
  feeRate: number,
  outputIndex: number = 0,
): {
  psbt: Psbt,
  fee: number
} {
  const scriptTree: Taptree = [
    {
      output: scripts.slashingScript,
    },
    [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }],
  ];

  return withdrawalTransaction(
    scripts,
    scriptTree,
    tx,
    withdrawalAddress,
    network,
    feeRate,
    outputIndex,
  );
}

// withdrawalTransaction generates a transaction that
// spends the staking output of the staking transaction
export function withdrawalTransaction(
  scripts: {
    timelockScript: Buffer,
  },
  scriptTree: Taptree,
  tx: Transaction,
  withdrawalAddress: string,
  network: networks.Network,
  feeRate: number,
  outputIndex: number = 0,
): {
  psbt: Psbt,
  fee: number
} {
  // Check that withdrawal feeRate is bigger than 0
  if (feeRate <= 0) {
    throw new Error("Withdrawal feeRate must be bigger than 0");
  }

  // Check that outputIndex is bigger or equal to 0
  if (outputIndex < 0) {
    throw new Error("Output index must be bigger or equal to 0");
  }

  // position of time in the timelock script
  const timePosition = 2;
  const decompiled = script.decompile(scripts.timelockScript);

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

  const redeem = {
    output: scripts.timelockScript,
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
    hash: tx.getHash(),
    index: outputIndex,
    tapInternalKey: internalPubkey,
    witnessUtxo: {
      value: tx.outs[outputIndex].value,
      script: tx.outs[outputIndex].script,
    },
    tapLeafScript: [tapLeafScript],
    sequence: timelock,
  });

  // Output size is the number of outputs + 1 for the withdrawal output
  const outputSize = psbt.txOutputs.length + 1
  const estimatedFee = getEstimatedFee(feeRate, psbt.txInputs.length, outputSize);

  psbt.addOutput({
    address: withdrawalAddress,
    value: tx.outs[outputIndex].value - estimatedFee,
  });

  return {
    psbt,
    fee: estimatedFee
  };
}

// slashingTransaction generates a transaction that
// spends the staking output of the staking transaction
// Outputs:
//   - The first one sends input * slashing_rate funds to the slashing address
//   - The second one sends input * (1-slashing_rate) - fee funds back to the user’s address
export function slashingTransaction(
  scripts: {
    changeScript: Buffer,
  },
  scriptTree: Taptree,
  redeemOutput: Buffer,
  transaction: Transaction,
  slashingAddress: string,
  slashingRate: number,
  minimumFee: number,
  network: networks.Network,
  outputIndex: number = 0,
): Psbt {
  // Check that slashing rate and minimum fee are bigger than 0
  if (slashingRate <= 0 || minimumFee <= 0) {
    throw new Error("Slashing rate and minimum fee must be bigger than 0");
  }

  // Check that outputIndex is bigger or equal to 0
  if (outputIndex < 0) {
    throw new Error("Output index must be bigger or equal to 0");
  }

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
    index: outputIndex,
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
    scriptTree: { output: scripts.changeScript },
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
  scripts: {
    unbondingScript: Buffer,
    unbondingTimelockScript: Buffer,
    timelockScript: Buffer,
    slashingScript: Buffer,
  },
  stakingTx: Transaction,
  network: networks.Network,
  feeRate: number,
  outputIndex: number = 0,
): {
  psbt: Psbt,
  fee: number
} {
  // Check that transaction fee is bigger than 0
  if (feeRate <= 0) {
    throw new Error("Unbonding feeRate must be bigger than 0");
  }

  // Check that outputIndex is bigger or equal to 0
  if (outputIndex < 0) {
    throw new Error("Output index must be bigger or equal to 0");
  }

  // Build input tapleaf script
  const inputScriptTree: Taptree = [
    {
      output: scripts.slashingScript,
    },
    [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }],
  ];

  const inputRedeem = {
    output: scripts.unbondingScript,
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
    index: outputIndex,
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
      output: scripts.slashingScript,
    },
    { output: scripts.unbondingTimelockScript },
  ];

  const unbondingOutput = payments.p2tr({
    internalPubkey,
    scriptTree: outputScriptTree,
    network,
  });

  const outputSize = psbt.txOutputs.length + 1
  const transactionFee = getEstimatedFee(feeRate, psbt.txInputs.length, outputSize);

  // Add the unbonding output
  psbt.addOutput({
    address: unbondingOutput.address!,
    value: stakingTx.outs[0].value - transactionFee,
  });

  return {
    psbt,
    fee: transactionFee
  };
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
