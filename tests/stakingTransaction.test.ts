import { initBTCCurve, stakingTransaction } from "../src/index";
import { networks } from "bitcoinjs-lib";
import { UTXO } from "../src/types/UTXO";
import { DataGenerator } from "./helper";

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
  beforeAll(() => {
    initBTCCurve();
  });
  // Define the networks to be used in the tests
  const mainnet = networks.bitcoin;
  const testnet = networks.testnet;

  // Initialize DataGenerators
  const mainnetDataGenerator = new DataGenerator(mainnet);
  const testnetDataGenerator = new DataGenerator(testnet);
  
  const amount = 1000;

  // Define mock UTXOs to be used in the tests
  const mockUTXOs: UTXO[] = [
    {
      txid: testnetDataGenerator.generateRandomTxId(),
      vout: 0, // Output index
      scriptPubKey: testnetDataGenerator.generateRandomKeyPairs().publicKey, // Script public key
      value: 5000, // Value in satoshis
    },
    {
      txid: testnetDataGenerator.generateRandomTxId(),
      vout: 1, // Output index
      scriptPubKey: testnetDataGenerator.generateRandomKeyPairs().publicKey, // Script public key
      value: 3000, // Value in satoshis
    },
  ];

  // Define mock scripts to be used in the tests
  const mockScripts = testnetDataGenerator.generateMockStakingScripts();

  it("should throw an error if the amount is less than or equal to 0", () => {
    // Test case: amount is 0
    expect(() =>
      stakingTransaction(
        mockScripts,
        0, // Invalid amount
        testnetDataGenerator.getNativeSegwitAddress(
          testnetDataGenerator.generateRandomKeyPairs().publicKey,
        ),
        mockUTXOs,
        testnet,
        testnetDataGenerator.generateRandomFeeRates(), // Valid fee rate
      ),
    ).toThrow("Amount and fee rate must be bigger than 0");

    // Test case: amount is -1
    expect(() =>
      stakingTransaction(
        mockScripts,
        -1, // Invalid amount
        testnetDataGenerator.getNativeSegwitAddress(
          testnetDataGenerator.generateRandomKeyPairs().publicKey,
        ),
        mockUTXOs,
        testnet,
        testnetDataGenerator.generateRandomFeeRates(), // Valid fee rate
      ),
    ).toThrow("Amount and fee rate must be bigger than 0");
  });

  it("should throw an error if the fee rate is less than or equal to 0", () => {
    // Test case: fee rate is 0
    expect(() =>
      stakingTransaction(
        mockScripts,
        amount,
        testnetDataGenerator.getNativeSegwitAddress(
          testnetDataGenerator.generateRandomKeyPairs().publicKey,
        ),
        mockUTXOs,
        testnet,
        0, // Invalid fee rate
      ),
    ).toThrow("Amount and fee rate must be bigger than 0");

    // Test case: fee rate is -1
    expect(() =>
      stakingTransaction(
        mockScripts,
        amount,
        testnetDataGenerator.getNativeSegwitAddress(
          testnetDataGenerator.generateRandomKeyPairs().publicKey,
        ),
        mockUTXOs,
        testnet,
        -1, // Invalid fee rate
      ),
    ).toThrow("Amount and fee rate must be bigger than 0");
  });

  it("should throw an error if the address mainnet address on a testnet envrionment", () => {
    const randomChangeAddress = mainnetDataGenerator.getNativeSegwitAddress(
      mainnetDataGenerator.generateRandomKeyPairs().publicKey,
    );
    expect(() =>
      stakingTransaction(
        mockScripts,
        amount,
        randomChangeAddress,
        mockUTXOs,
        testnet,
        1,
        Buffer.from(
          testnetDataGenerator.generateRandomKeyPairs(true).publicKey,
          "hex",
        ),
      ),
    ).toThrow(`${randomChangeAddress} has an invalid prefix`);
  });

  it("should throw an error if the address testnet address on a mainnet envrionment", () => {
    const randomChangeAddress = testnetDataGenerator.getNativeSegwitAddress(
      testnetDataGenerator.generateRandomKeyPairs().publicKey,
    );
    expect(() =>
      stakingTransaction(
        mockScripts,
        amount,
        randomChangeAddress,
        mockUTXOs,
        mainnet,
        1,
        Buffer.from(
          mainnetDataGenerator.generateRandomKeyPairs(true).publicKey,
          "hex",
        ),
      ),
    ).toThrow(`${randomChangeAddress} has an invalid prefix`);
  });

  it("should throw an error if the public key is invalid", () => {
    const invalidPublicKey = Buffer.from("invalidPublicKey", "hex");
    // Test case: invalid public key
    expect(() =>
      stakingTransaction(
        mockScripts,
        amount,
        testnetDataGenerator.getNativeSegwitAddress(
          testnetDataGenerator.generateRandomKeyPairs().publicKey,
        ),
        mockUTXOs,
        testnet,
        testnetDataGenerator.generateRandomFeeRates(), // Valid fee rate
        invalidPublicKey, // Invalid public key
      ),
    ).toThrow("Invalid public key");
  });
});
