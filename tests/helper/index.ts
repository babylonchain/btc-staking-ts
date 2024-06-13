import ECPairFactory from "ecpair";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import * as bitcoin from 'bitcoinjs-lib';
import { StakingScripts } from "../../src/types/StakingScripts";
import { StakingScriptData } from "../../src";
import { UTXO } from "../../src/types/UTXO";

const ECPair = ECPairFactory(ecc);

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

  generateRandomKeyPairs = (isNoCoordPk = false) => {
    const keyPair = ECPair.makeRandom({ network: this.network });
    const { privateKey, publicKey } = keyPair;
    if (!privateKey || !publicKey) {
      throw new Error("Failed to generate random key pair");
    }
    let pk = publicKey.toString("hex");
    if (isNoCoordPk) {
      // Check if the public key is in the "no coordinate" format
      // If it is, remove the prefix
      if (pk.startsWith("02") || pk.startsWith("03")) {
        // Remove the prefix to get the "no coordinate" format (just the x-coordinate)
        pk = pk.slice(2);
      }
    }
    return {
      privateKey: privateKey.toString("hex"),
      publicKey: pk,
    };
  };

  // Generate a random staking term (number of blocks to stake)
  // ranged from 1 to 65535
  generateRandomStakingTerm = () => {
    return Math.floor(Math.random() * 65535) + 1;
  };

  generateRandomFeeRates = () => {
    return Math.floor(Math.random() * 1000) + 1;
  };

  // Convenant quorums are a list of public keys that are used to sign a covenant
  generateRandomCovenantCommittee = (size: number): Buffer[] => {
    const quorum: Buffer[] = [];
    for (let i = 0; i < size; i++) {
      const keyPair = this.generateRandomKeyPairs(true);
      quorum.push(Buffer.from(keyPair.publicKey, "hex"));
    }
    return quorum;
  };

  generateRandomTag = () => {
    const buffer = Buffer.alloc(4);
    for (let i = 0; i < 4; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    return buffer;
  };

  generateRandomGlobalParams = () => {
    const covenantPks = this.generateRandomCovenantCommittee(3).map((buffer) =>
      buffer.toString("hex"),
    );

    return {
      covenantPks,
      covenantQuorum: Math.floor(Math.random() * 3) + 1,
      unbondingTime: this.generateRandomStakingTerm(),
      tag: this.generateRandomTag().toString("hex"),
    };
  };

  getTaprootAddress = (publicKey: string) => {
    const internalPubkey = Buffer.from(publicKey, "hex");
    const { address } = bitcoin.payments.p2tr({
      internalPubkey,
      network: this.network,
    });
    if (!address) {
      throw new Error("Failed to generate taproot address from public key");
    }
    return address;
  };

  getNativeSegwitAddress = (publicKey: string) => {
    const internalPubkey = Buffer.from(publicKey, "hex");
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: internalPubkey,
      network: this.network,
    });
    if (!address) {
      throw new Error(
        "Failed to generate native segwit address from public key",
      );
    }
    return address;
  };

  getNetwork = () => {
    return this.network;
  };

  generateMockStakingScripts = (): StakingScripts => {
    const finalityProviderPk = this.generateRandomKeyPairs(true).publicKey;
    const stakingTxTimelock = this.generateRandomStakingTerm();
    const publicKeyNoCoord = this.generateRandomKeyPairs(true).publicKey;
    const globalParams = this.generateRandomGlobalParams();

    // Convert covenant PKs to buffers
    const covenantPKsBuffer = globalParams.covenantPks.map((pk) =>
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
    dataGenerator: DataGenerator,
    numUTXOs: number,
  ): UTXO[] => {
    return Array.from({ length: numUTXOs }, () => ({
      txid: dataGenerator.generateRandomTxId(),
      vout: Math.floor(Math.random() * 10),
      scriptPubKey: this.generateRandomKeyPairs().publicKey,
      value: Math.floor(Math.random() * 9000) + 1000,
    }));
  };
}
