import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import * as bitcoin from "bitcoinjs-lib";
import ECPairFactory, { ECPairInterface } from "ecpair";
import { StakingScriptData, stakingTransaction } from "../../src";
import { StakingScripts } from "../../src/types/StakingScripts";
import { UTXO } from "../../src/types/UTXO";
import { generateRandomAmountSlices } from "./math";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

export const DEFAULT_TEST_FEE_RATE = 15;


export interface KeyPair {
  privateKey: string;
  publicKey: string;
  publicKeyNoCoord: string;
  keyPair: ECPairInterface;
}

export class DataGenerator {
  private network: bitcoin.networks.Network;

  constructor(network: bitcoin.networks.Network) {
    this.network = network;
  }

  generateRandomTxId = () => {
    const randomBuffer = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      randomBuffer[i] = Math.floor(Math.random() * 256);
    }
    return randomBuffer.toString("hex");
  };

  generateRandomKeyPair = () => {
    const keyPair = ECPair.makeRandom({ network: this.network });
    const { privateKey, publicKey } = keyPair;
    if (!privateKey || !publicKey) {
      throw new Error("Failed to generate random key pair");
    }
    let pk = publicKey.toString("hex");

    return {
      privateKey: privateKey.toString("hex"),
      publicKey: pk,
      publicKeyNoCoord: pk.slice(2),
      keyPair,
    };
  };

  // Generate a random staking term (number of blocks to stake)
  // ranged from 1 to 65535
  generateRandomStakingTerm = () => {
    return Math.floor(Math.random() * 65535) + 1;
  };

  generateRandomUnbondingTime = (stakingTerm: number) => {
    return Math.floor(Math.random() * stakingTerm) + 1;
  };

  generateRandomFeeRates = () => {
    return Math.floor(Math.random() * 1000) + 1;
  };

  // Convenant committee are a list of public keys that are used to sign a covenant
  generateRandomCovenantCommittee = (size: number): Buffer[] => {
    const committe: Buffer[] = [];
    for (let i = 0; i < size; i++) {
      const publicKeyNoCoord = this.generateRandomKeyPair().publicKeyNoCoord;
      committe.push(Buffer.from(publicKeyNoCoord, "hex"));
    }
    return committe;
  };

  generateRandomTag = () => {
    const buffer = Buffer.alloc(4);
    for (let i = 0; i < 4; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    return buffer;
  };

  generateRandomGlobalParams = (stakingTerm: number, committeeSize: number) => {
    const covenantPks = this.generateRandomCovenantCommittee(committeeSize).map(
      (buffer) => buffer.toString("hex"),
    );
    const covenantQuorum = Math.floor(Math.random() * (committeeSize - 1)) + 1;
    const unbondingTime = this.generateRandomUnbondingTime(stakingTerm);
    const tag = this.generateRandomTag().toString("hex");
    return {
      covenantPks,
      covenantQuorum,
      unbondingTime,
      tag,
    };
  };

  getAddressAndScriptPubKey = (publicKey: string) => {
    return {
      taproot: this.getTaprootAddress(publicKey),
      nativeSegwit: this.getNativeSegwitAddress(publicKey),
    };
  };

  getNetwork = () => {
    return this.network;
  };

  generateMockStakingScripts = (): StakingScripts => {
    const finalityProviderPk = this.generateRandomKeyPair().publicKeyNoCoord;
    const stakingTxTimelock = this.generateRandomStakingTerm();
    const publicKeyNoCoord = this.generateRandomKeyPair().publicKeyNoCoord;
    const committeeSize = Math.floor(Math.random() * 10) + 1;
    const globalParams = this.generateRandomGlobalParams(
      stakingTxTimelock,
      committeeSize,
    );

    // Convert covenant PKs to buffers
    const covenantPKsBuffer = globalParams.covenantPks.map((pk: string) =>
      Buffer.from(pk, "hex"),
    );

    // Create staking script data
    let stakingScriptData;
    try {
      stakingScriptData = new StakingScriptData(
        Buffer.from(publicKeyNoCoord, "hex"),
        [Buffer.from(finalityProviderPk, "hex")],
        covenantPKsBuffer,
        globalParams.covenantQuorum,
        stakingTxTimelock,
        globalParams.unbondingTime,
        Buffer.from(globalParams.tag, "hex"),
      );
    } catch (error: Error | any) {
      throw new Error(error?.message || "Cannot build staking script data");
    }

    // Build scripts
    let scripts;
    try {
      scripts = stakingScriptData.buildScripts();
    } catch (error: Error | any) {
      throw new Error(error?.message || "Error while recreating scripts");
    }

    return scripts;
  };

  generateRandomUTXOs = (
    balance: number,
    numberOfUTXOs: number,
    scriptPubKey?: string,
  ): UTXO[] => {
    if (!scriptPubKey) {
      const pk = this.generateRandomKeyPair().publicKey;
      const { nativeSegwit } = this.getAddressAndScriptPubKey(pk);
      scriptPubKey = nativeSegwit.scriptPubKey;
    }
    const slices = generateRandomAmountSlices(balance, numberOfUTXOs);
    return slices.map((v) => {
      return {
        txid: this.generateRandomTxId(),
        vout: Math.floor(Math.random() * 10),
        scriptPubKey: scriptPubKey,
        value: v,
      };
    });
  };

  /**
   * Generates a random integer between min and max.
   *
   * @param {number} min - The minimum number.
   * @param {number} max - The maximum number.
   * @returns {number} - A random integer between min and max.
   */
  getRandomIntegerBetween = (min: number, max: number): number => {
    if (min > max) {
      throw new Error(
        "The minimum number should be less than or equal to the maximum number.",
      );
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  generateRandomStakingTransaction = (
    feeRate: number,
    stakerKeyPair: KeyPair,
    stakingAmount?: number,
  ): bitcoin.Transaction => {
    const {publicKey, publicKeyNoCoord: stakerPublicKeyNoCoord} = stakerKeyPair;
    const { scriptPubKey, address: nativeSegwitAddress } = this.getNativeSegwitAddress(publicKey);
    const fpPkHex = this.generateRandomKeyPair().publicKeyNoCoord;

    const committeeSize = this.getRandomIntegerBetween(1, 10);
    const stakingTerm = this.generateRandomStakingTerm();
    const globalParams = this.generateRandomGlobalParams(stakingTerm, committeeSize);
    const timeLock = this.getRandomIntegerBetween(1, stakingTerm);

    const stakingScriptData = new StakingScriptData(
      Buffer.from(stakerPublicKeyNoCoord, "hex"),
      [Buffer.from(fpPkHex, "hex")],
      globalParams.covenantPks.map((pk: string) => Buffer.from(pk, "hex")),
      globalParams.covenantQuorum,
      stakingTerm,
      timeLock,
      Buffer.from(globalParams.tag, "hex"),
    );

    const stakingScripts = stakingScriptData.buildScripts();

    const utxos = this.generateRandomUTXOs(
      this.getRandomIntegerBetween(1000000, 100000000),
      this.getRandomIntegerBetween(1, 10),
      scriptPubKey,
    );

    const { psbt } = stakingTransaction(
      stakingScripts,
      stakingAmount? stakingAmount : this.getRandomIntegerBetween(1000, 100000),
      nativeSegwitAddress,
      utxos,
      this.network,
      feeRate,
    );
    
    return psbt
      .signAllInputs(stakerKeyPair.keyPair)
      .finalizeAllInputs()
      .extractTransaction();
  };

  private getTaprootAddress = (publicKey: string) => {
    // Remove the prefix if it exists
    if (publicKey.length == 66) {
      publicKey = publicKey.slice(2);
    }
    const internalPubkey = Buffer.from(publicKey, "hex");
    const { address, output: scriptPubKey } = bitcoin.payments.p2tr({
      internalPubkey,
      network: this.network,
    });
    if (!address || !scriptPubKey) {
      throw new Error(
        "Failed to generate taproot address or script from public key",
      );
    }
    return {
      address,
      scriptPubKey: scriptPubKey.toString("hex"),
    };
  };

  private getNativeSegwitAddress = (publicKey: string) => {
    // check the public key length is 66, otherwise throw
    if (publicKey.length !== 66) {
      throw new Error("Invalid public key length for generating native segwit address");
    }
    const internalPubkey = Buffer.from(publicKey, "hex");
    const { address, output: scriptPubKey } = bitcoin.payments.p2wpkh({
      pubkey: internalPubkey,
      network: this.network,
    });
    if (!address || !scriptPubKey) {
      throw new Error(
        "Failed to generate native segwit address or script from public key",
      );
    }
    return {
      address,
      scriptPubKey: scriptPubKey.toString("hex"),
    };
  };
}

export default DataGenerator;