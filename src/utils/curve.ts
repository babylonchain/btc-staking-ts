import { initEccLib } from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";

// Initialize elliptic curve library
export function initBTCCurve() {
  initEccLib(ecc);
}
