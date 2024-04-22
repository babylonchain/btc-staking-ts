import { initEccLib } from "bitcoinjs-lib";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";

// Initialize elliptic curve library
export function initBTCCurve() {
  initEccLib(ecc);
}
