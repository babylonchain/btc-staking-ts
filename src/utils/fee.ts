import { UTXO } from "../types/UTXO";

// Estimated size of a transaction input in bytes for fee calculation purpose only
export const INPUT_SIZE_FOR_FEE_CAL = 180;

// Estimated size of a transaction output in bytes for fee calculation purpose only
export const OUTPUT_SIZE_FOR_FEE_CAL = 34;

// Buffer size for a transaction in bytes for fee calculation purpose only
export const TX_BUFFER_SIZE_FOR_FEE_CAL = 10;

export const getEstimatedFee = (
    feeRate: number, numInputs: number, numOutputs: number,
): number => {
    return (
        numInputs * INPUT_SIZE_FOR_FEE_CAL +
        numOutputs * OUTPUT_SIZE_FOR_FEE_CAL +
        TX_BUFFER_SIZE_FOR_FEE_CAL + numInputs
    ) * feeRate;
}
export const inputValueSum = (inputUTXOs: UTXO[]): number => {
    return inputUTXOs.reduce((acc, utxo) => acc + utxo.value, 0);
}