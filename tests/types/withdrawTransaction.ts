import { ECPairInterface } from "ecpair";
import { UTXO } from "../../src/types/UTXO";
import { Transaction } from "bitcoinjs-lib";

export interface WithdrawTransactionTestData {
  feeRate: number;
  keyPair: ECPairInterface;
  publicKey: string;
  publicKeyNoCoord: string;
  address: string;
  timelockScript: Buffer;
  slashingScript: Buffer;
  unbondingScript: Buffer;
  unbondingTimelockScript: Buffer;
  randomAmount: number;
  utxos: UTXO[];
  transaction: Transaction;
}