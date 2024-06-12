import ECPairFactory from "ecpair";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import * as bitcoin from 'bitcoinjs-lib';
import { StakingScripts } from "../../src/types/StakingScripts";
import { StakingScriptData } from "../../src";

const ECPair = ECPairFactory(ecc);

export class DataGenerator {
  private netWork: bitcoin.networks.Network;

  constructor(network: bitcoin.networks.Network) {
    this.netWork = network;
  }

  generateRandomKeyPairs = (isNoCoordPk = false) => {
    const keyPair = ECPair.makeRandom({ network: this.netWork });
    const { privateKey, publicKey } = keyPair;
    if (!privateKey) {
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
  // ranged from 1 to 100000
  generateRandomStakingTerms = () => {
    return Math.floor(Math.random() * 100000) + 1;
  };

  generateRandomFeeRates = () => {
    return Math.floor(Math.random() * 1000) + 1;
  };

  // Convenant quorums are a list of public keys that are used to sign a covenant
  generateRandomCovenantQuorums = (size: number): Buffer[] => {
    const quorum: Buffer[] = [];
    for (let i = 0; i < size; i++) {
      const keyPair = this.generateRandomKeyPairs(true);
      quorum.push(Buffer.from(keyPair.publicKey, "hex"));
    }
    return quorum;
  };

  generateRandomTag = () => {
    const randomTagNum = Math.floor(Math.random() * 100000000) + 1;
    return Buffer.from(randomTagNum.toString(), "utf8");
  };

  getTaprootAddress = (publicKey: string) => {
    const internalPubkey = Buffer.from(publicKey, "hex");
    const { address } = bitcoin.payments.p2tr({
      internalPubkey,
      network: this.netWork,
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
      network: this.netWork,
    });
    if (!address) {
      throw new Error(
        "Failed to generate native segwit address from public key",
      );
    }
    return address;
  };

  getNetwork = () => {
    return this.netWork;
  };

  generateMockStakingScripts = (): StakingScripts => {
    const finalityProviderPk = this.generateRandomKeyPairs(true).publicKey;
    const stakingTxTimelock = 65535; // cannot exceed 65535
    const publicKeyNoCoord = this.generateRandomKeyPairs(true).publicKey;

    const globalParams = {
      covenantPks: this.generateRandomCovenantQuorums(3).map((buffer) =>
        buffer.toString("hex"),
      ),
      covenantQuorum: Math.floor(Math.random() * 3) + 1,
      unbondingTime: this.generateRandomStakingTerms(),
      tag: this.generateRandomTag().toString("hex"),
    };

    // Convert covenant PKs to buffers
    const covenantPKsBuffer = globalParams.covenantPks.map((pk) => {
      const buffer = Buffer.from(pk, "hex");
      const subBuffer = buffer.length === 33 ? buffer.subarray(1, 33) : buffer; // Handle compressed keys
      return subBuffer;
    });
    
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
}
