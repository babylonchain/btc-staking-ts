import { Buffer } from "buffer";
import { createWitness } from "../src";

describe("createWitness", () => {
  it("should return only originalWitness if no matches found", () => {
    const originalWitness = [Buffer.from("originalWitness1", "utf-8")];
    const paramsCovenants = [Buffer.from("covenant1", "utf-8")];
    const covenantSigs = [
      { btc_pk_hex: "6e6f6e6578697374656e74", sig_hex: "7369676e6174757265" }, // 'nonexistent' and 'signature' in hex
    ];

    const result = createWitness(
      originalWitness,
      paramsCovenants,
      covenantSigs,
    );

    expect(result).toEqual([
      Buffer.alloc(0), // No match for 'covenant1' in covenantSigs
      ...originalWitness,
    ]);
  });

  it("should return the correct witness when multiple covenants are matched", () => {
    const originalWitness = [Buffer.from("originalWitness1", "utf-8")];
    const paramsCovenants = [
      Buffer.from("covenant1", "utf-8"),
      Buffer.from("covenant2", "utf-8"),
    ];
    const covenantSigs = [
      { btc_pk_hex: "636f76656e616e7431", sig_hex: "7369676e617475726531" }, // 'covenant1' and 'signature1' in hex
      { btc_pk_hex: "636f76656e616e7432", sig_hex: "7369676e617475726532" }, // 'covenant2' and 'signature2' in hex
    ];

    const result = createWitness(
      originalWitness,
      paramsCovenants,
      covenantSigs,
    );

    expect(result).toEqual([
      Buffer.from("7369676e617475726532", "hex"), // 'signature2' in hex
      Buffer.from("7369676e617475726531", "hex"), // 'signature1' in hex
      ...originalWitness,
    ]);
  });

  it("should return empty Buffer for unmatched covenants", () => {
    const originalWitness = [Buffer.from("originalWitness1", "utf-8")];
    const paramsCovenants = [Buffer.from("covenant3", "utf-8")];
    const covenantSigs = [
      { btc_pk_hex: "636f76656e616e7431", sig_hex: "7369676e617475726531" }, // 'covenant1' and 'signature1' in hex
      { btc_pk_hex: "636f76656e616e7432", sig_hex: "7369676e617475726532" }, // 'covenant2' and 'signature2' in hex
    ];

    const result = createWitness(
      originalWitness,
      paramsCovenants,
      covenantSigs,
    );

    expect(result).toEqual([
      Buffer.alloc(0), // No match for 'covenant3' in covenantSigs
      ...originalWitness,
    ]);
  });
});
