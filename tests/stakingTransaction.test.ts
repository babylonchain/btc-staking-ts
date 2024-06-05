import { stakingTransaction } from "../src/index";
import { networks } from "bitcoinjs-lib";
import { UTXO } from "../src/types/UTXO";

// Mock the bitcoinjs-lib module
jest.mock("bitcoinjs-lib", () => ({
  ...jest.requireActual("bitcoinjs-lib"),
  address: {
    toOutputScript: jest.fn((address, network) => {
      if (address === "invalid") {
        throw new Error("Invalid change address");
      }
      return Buffer.from("mockedOutputScript", "hex");
    }),
  },
}));

describe("stakingTransaction", () => {
  // Define mock scripts to be used in the tests
  const mockScripts = {
    timelockScript: Buffer.from("timelockScript", "hex"),
    unbondingScript: Buffer.from("unbondingScript", "hex"),
    slashingScript: Buffer.from("slashingScript", "hex"),
  };

  // Define mock UTXOs to be used in the tests
  const mockUTXOs: UTXO[] = [
    {
      txid: "0xDummyTxId", // Dummy transaction ID
      vout: 0, // Output index
      scriptPubKey: "0xScriptPubKey", // Script public key
      value: 5000, // Value in satoshis
    },
  ];

  // Define the network to be used in the tests (testnet in this case)
  const network = networks.testnet;

  it("should throw an error if the amount is less than or equal to 0", () => {
    // Test case: amount is 0
    expect(() =>
      stakingTransaction(
        mockScripts,
        0, // Invalid amount
        "changeAddress",
        mockUTXOs,
        network,
        1, // Valid fee rate
      ),
    ).toThrow("Amount and fee rate must be bigger than 0");

    // Test case: amount is -1
    expect(() =>
      stakingTransaction(
        mockScripts,
        -1, // Invalid amount
        "changeAddress",
        mockUTXOs,
        network,
        1, // Valid fee rate
      ),
    ).toThrow("Amount and fee rate must be bigger than 0");
  });

  it("should throw an error if the fee rate is less than or equal to 0", () => {
    // Test case: fee rate is 0
    expect(() =>
      stakingTransaction(
        mockScripts,
        1000, // Valid amount
        "changeAddress",
        mockUTXOs,
        network,
        0, // Invalid fee rate
      ),
    ).toThrow("Amount and fee rate must be bigger than 0");

    // Test case: fee rate is -1
    expect(() =>
      stakingTransaction(
        mockScripts,
        1000, // Valid amount
        "changeAddress",
        mockUTXOs,
        network,
        -1, // Invalid fee rate
      ),
    ).toThrow("Amount and fee rate must be bigger than 0");
  });

  it("should throw an error if the change address is invalid", () => {
    expect(() =>
      stakingTransaction(mockScripts, 1000, "invalid", mockUTXOs, network, 1),
    ).toThrow("Invalid change address"); // Updated to match the actual error message
  });

  it("should throw an error if the public key is invalid", () => {
    // Define an invalid public key
    const invalidPublicKey = Buffer.from("invalidPublicKey", "hex");

    // Test case: invalid public key
    expect(() =>
      stakingTransaction(
        mockScripts,
        1000, // Valid amount
        "changeAddress",
        mockUTXOs,
        network,
        1, // Valid fee rate
        invalidPublicKey, // Invalid public key
      ),
    ).toThrow("Invalid public key");
  });
});
