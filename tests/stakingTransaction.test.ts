import { initBTCCurve, stakingTransaction } from "../src/index";
import { networks } from "bitcoinjs-lib";
import { DataGenerator } from "./helper";

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

  const mockUTXOs = testnetDataGenerator.generateRandomUTXOs(
    testnetDataGenerator,
    Math.floor(Math.random() * 5) + 1,
  );
  const totalUTXOValue = mockUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);
  const amount = Math.floor(Math.random() * (totalUTXOValue - 1000 + 1)) + 1000;

  // Define mock scripts to be used in the tests
  const mockScripts = testnetDataGenerator.generateMockStakingScripts();

  it("should throw an error if the amount is less than or equal to 0", () => {
    // Test case: amount is 0
    expect(() =>
      stakingTransaction(
        mockScripts,
        0, // Invalid amount
        testnetDataGenerator.getNativeSegwitAddress(
          testnetDataGenerator.generateRandomKeyPair().publicKey,
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
          testnetDataGenerator.generateRandomKeyPair().publicKey,
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
          testnetDataGenerator.generateRandomKeyPair().publicKey,
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
          testnetDataGenerator.generateRandomKeyPair().publicKey,
        ),
        mockUTXOs,
        testnet,
        -1, // Invalid fee rate
      ),
    ).toThrow("Amount and fee rate must be bigger than 0");
  });

  it("should throw an error if the address mainnet address on a testnet envrionment", () => {
    const randomChangeAddress = mainnetDataGenerator.getNativeSegwitAddress(
      mainnetDataGenerator.generateRandomKeyPair().publicKey,
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
          testnetDataGenerator.generateRandomKeyPair(true).publicKey,
          "hex",
        ),
      ),
    ).toThrow(`${randomChangeAddress} has an invalid prefix`);
  });

  it("should throw an error if the address testnet address on a mainnet envrionment", () => {
    const randomChangeAddress = testnetDataGenerator.getNativeSegwitAddress(
      testnetDataGenerator.generateRandomKeyPair().publicKey,
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
          mainnetDataGenerator.generateRandomKeyPair(true).publicKey,
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
          testnetDataGenerator.generateRandomKeyPair().publicKey,
        ),
        mockUTXOs,
        testnet,
        testnetDataGenerator.generateRandomFeeRates(), // Valid fee rate
        invalidPublicKey, // Invalid public key
      ),
    ).toThrow("Invalid public key");
  });
});
