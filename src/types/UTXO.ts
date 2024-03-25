// UTXO is a structure defining attributes for a UTXO
export interface UTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
}
