import { Psbt } from "bitcoinjs-lib";

// PsbtTransactionResult is the result of a transaction creation
//  - psbt: The partially signed transaction
//  - fee: The total fee of the transaction
export interface PsbtTransactionResult {
    psbt: Psbt;
    fee: number;
}