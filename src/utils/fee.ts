import { UTXO } from "../types/UTXO";

// Estimated size of a transaction input in bytes for fee calculation purpose only
export const INPUT_SIZE_FOR_FEE_CAL = 180;

// Estimated size of a transaction output in bytes for fee calculation purpose only
export const OUTPUT_SIZE_FOR_FEE_CAL = 34;

// Buffer size for a transaction in bytes for fee calculation purpose only
export const TX_BUFFER_SIZE_FOR_FEE_CAL = 10;

// Estimated size of an OP_RETURN output in bytes for fee calculation purpose only
export const ESTIMATED_OP_RETURN_SIZE = 40;

/**
 * Calculates the estimated transaction fee using a heuristic formula.
 *
 * This method estimates the transaction fee based on the formula:
 * `numInputs * 180 + numOutputs * 34 + 10 + numInputs`
 *
 * The formula provides an overestimated transaction size to ensure sufficient fees:
 * - Each input is approximated to 180 bytes.
 * - Each output is approximated to 34 bytes.
 * - Adds 10 bytes as a buffer for the transaction.
 * - Adds 40 bytes for an OP_RETURN output.
 * - Adds the number of inputs to account for additional overhead.
 *
 * @param feeRate - The fee rate in satoshis per byte.
 * @param numInputs - The number of inputs in the transaction.
 * @param numOutputs - The number of outputs in the transaction.
 * @returns The estimated transaction fee in satoshis.
 */
export const getEstimatedFee = (
    feeRate: number, numInputs: number, numOutputs: number,
): number => {
    return (
        numInputs * INPUT_SIZE_FOR_FEE_CAL +
        numOutputs * OUTPUT_SIZE_FOR_FEE_CAL +
        TX_BUFFER_SIZE_FOR_FEE_CAL + numInputs + ESTIMATED_OP_RETURN_SIZE
    ) * feeRate;
}

// inputValueSum returns the sum of the values of the UTXOs
export const inputValueSum = (inputUTXOs: UTXO[]): number => {
    return inputUTXOs.reduce((acc, utxo) => acc + utxo.value, 0);
}

/**
 * Selects UTXOs and calculates the fee for a staking transaction.
 *
 * This method selects the highest value UTXOs from all available UTXOs to 
 * cover the staking amount and the transaction fees.
 *
 * Inputs:
 * - availableUTXOs: All available UTXOs from the wallet.
 * - stakingAmount: Amount to stake.
 * - feeRate: Fee rate for the transaction in satoshis per byte.
 * - numOfOutputs: Number of outputs in the transaction.
 *
 * Returns:
 * - selectedUTXOs: The UTXOs selected to cover the staking amount and fees.
 * - fee: The total fee amount for the transaction.
 *
 * @param {UTXO[]} availableUTXOs - All available UTXOs from the wallet.
 * @param {number} stakingAmount - The amount to stake.
 * @param {number} feeRate - The fee rate in satoshis per byte.
 * @param {number} numOfOutputs - The number of outputs in the transaction.
 * @returns {PsbtTransactionResult} An object containing the selected UTXOs and the fee.
 * @throws Will throw an error if there are insufficient funds or if the fee cannot be calculated.
 */
export const getStakingTxInputUTXOsAndFees = (
    availableUTXOs: UTXO[],
    stakingAmount: number,
    feeRate: number,
    numOfOutputs: number,
): {
    selectedUTXOs: UTXO[],
    fee: number,
} => {
    if (availableUTXOs.length === 0) {
        throw new Error("Insufficient funds");
    }
    // Sort available UTXOs from highest to lowest value
    availableUTXOs.sort((a, b) => b.value - a.value);

    let selectedUTXOs: UTXO[] = [];
    let accumulatedValue = 0;
    let estimatedFee;

    for (const utxo of availableUTXOs) {
        selectedUTXOs.push(utxo);
        accumulatedValue += utxo.value;
        estimatedFee = getEstimatedFee(feeRate, selectedUTXOs.length, numOfOutputs);
        if (accumulatedValue >= stakingAmount + estimatedFee) {
            break;
        }
    }
    if (!estimatedFee) {
        throw new Error("Unable to calculate fee.");
    }

    if (accumulatedValue < stakingAmount + estimatedFee) {
        throw new Error("Insufficient funds: unable to gather enough UTXOs to cover the staking amount and fees.");
    }

    return {
        selectedUTXOs,
        fee: estimatedFee,
    };
}