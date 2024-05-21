declare module 'coinselect' {
    export interface UTXO {
        txid: string | Buffer,
        vout: number,
        value: number,
        nonWitnessUtxo?: Buffer,
        witnessUtxo?: {
            script: Buffer,
            value: number
        }
        scriptPubKey: string;
    }

    export interface Target {
        address: string;
        value: number;
    }

    export interface SelectedUTXO {
        inputs?: UTXO[],
        outputs?: Target[],
        fee: number
    }

    export function coinSelect(
        utxos: UTXO[],
        outputs: Target[],
        feeRate: number
    ): SelectedUTXO;
}
