import { initBTCCurve, stakingTransaction } from "../src/index";
import { getStakingTxInputUTXOsAndFees } from "../src/utils/fee";
import { BTC_DUST_SAT } from "../src/constants/dustSat";
import { PsbtTransactionResult } from "../src/types/transaction";
import { StakingScripts } from "../src/types/StakingScripts";
import { testingNetworks } from "./helper";


describe("stakingTransaction", () => {
  beforeAll(() => {
    initBTCCurve();
  });

  describe("Cross env error", () => {
    const [mainnet, testnet] = testingNetworks;
    const mainnetDataGenerator = mainnet.dataGenerator;
    const testnetDataGenerator = testnet.dataGenerator;
    const randomAmount = Math.floor(Math.random() * 100000000) + 1000;

    it("should throw an error if the testnet inputs are used on mainnet", () => {
      const randomChangeAddress = testnetDataGenerator.getNativeSegwitAddress(
        mainnetDataGenerator.generateRandomKeyPair().publicKey,
      );
      const utxos = testnetDataGenerator.generateRandomUTXOs(
        Math.floor(Math.random() * 1000000) + randomAmount,
        Math.floor(Math.random() * 10) + 1,
      );
      expect(() =>
        stakingTransaction(
          testnetDataGenerator.generateMockStakingScripts(),
          randomAmount,
          randomChangeAddress,
          utxos,
          mainnet.network,
          1,
          Buffer.from(
            testnetDataGenerator.generateRandomKeyPair(true).publicKey,
            "hex",
          ),
        ),
      ).toThrow("Invalid change address");
    });

    it("should throw an error if the mainnet inputs are used on testnet", () => {
      const randomChangeAddress = mainnetDataGenerator.getNativeSegwitAddress(
        mainnetDataGenerator.generateRandomKeyPair().publicKey,
      );
      const utxos = mainnetDataGenerator.generateRandomUTXOs(
        Math.floor(Math.random() * 1000000) + randomAmount,
        Math.floor(Math.random() * 10) + 1,
      );
      expect(() =>
        stakingTransaction(
          mainnetDataGenerator.generateMockStakingScripts(),
          randomAmount,
          randomChangeAddress,
          utxos,
          testnet.network,
          1,
          Buffer.from(
            mainnetDataGenerator.generateRandomKeyPair(true).publicKey,
            "hex",
          ),
        ),
      ).toThrow("Invalid change address");
    });
  });

  testingNetworks.map(({ networkName, network, dataGenerator }) => {
    const mockScripts = dataGenerator.generateMockStakingScripts();
    // for easier calculation, we set the fee rate to 1. The dynamic fee rate is tested in the other tests
    const feeRate = 1
    const randomAmount = Math.floor(Math.random() * 100000000) + 1000;
    // Create enough utxos to cover the amount
    const utxos = dataGenerator.generateRandomUTXOs(
      Math.floor(Math.random() * 1000000) + randomAmount,
      Math.floor(Math.random() * 10) + 1,
    );
    const maxNumOfOutputs = 3;
    // A rough estimating of the fee, the end result should not be too far from this
    const { fee: estimatedFee } = getStakingTxInputUTXOsAndFees(utxos, randomAmount, feeRate, maxNumOfOutputs);
    const changeAddress = dataGenerator.getNativeSegwitAddress(
      dataGenerator.generateRandomKeyPair().publicKey,
    );
    describe("Error path", () => {{
      it(`${networkName} - should throw an error if the public key is invalid`, () => {
        const invalidPublicKey = Buffer.from("invalidPublicKey", "hex");
        expect(() =>
          stakingTransaction(
            mockScripts,
            randomAmount,
            dataGenerator.getNativeSegwitAddress(
              dataGenerator.generateRandomKeyPair().publicKey,
            ),
            utxos,
            network,
            feeRate,
            invalidPublicKey, // Invalid public key
          ),
        ).toThrow("Invalid public key");
      });

      it(`${networkName} - should throw an error if the change address is invalid`, () => {
        const validAddress = dataGenerator.getNativeSegwitAddress(
          dataGenerator.generateRandomKeyPair().publicKey,
        );
        const invalidCharInAddress = validAddress.replace(validAddress[0], "I") // I is an invalid character in base58
        const invalidAddressLegnth = validAddress.slice(0, -1)
        const invalidAddresses = ["" , " ", "banana", invalidCharInAddress, invalidAddressLegnth]
        invalidAddresses.map(a => {
          expect(() =>
            stakingTransaction(
              mockScripts,
              randomAmount,
              a, // Invalid address
              utxos,
              network,
              feeRate,
            ),
          ).toThrow("Invalid change address");
        });
      });

      it(`${networkName} - should throw an error if the utxo value is too low`, () => {
        // generate a UTXO that is too small to cover the fee
        const utxo = {
          txid: dataGenerator.generateRandomTxId(),
          vout: Math.floor(Math.random() * 10),
          scriptPubKey: dataGenerator.generateRandomKeyPair().publicKey,
          value: 1,
        }
        expect(() =>
          stakingTransaction(
            mockScripts,
            randomAmount,
            dataGenerator.getNativeSegwitAddress(
              dataGenerator.generateRandomKeyPair().publicKey,
            ),
            [utxo],
            network,
            1,
          ),
        ).toThrow("Insufficient funds: unable to gather enough UTXOs to cover the staking amount and fees.");
      });

      it(`${networkName} - should throw an error if UTXO is empty`, () => {
        expect(() =>
          stakingTransaction(
            mockScripts,
            randomAmount,
            dataGenerator.getNativeSegwitAddress(
              dataGenerator.generateRandomKeyPair().publicKey,
            ),
            [],
            network,
            1,
          ),
        ).toThrow("Insufficient funds");
      });

      it(`${networkName} - should throw an error if the lock height is invalid`, () => {
        // 500000000 is the maximum lock height in btc
        const invalidLockHeight = 500000000 + 1;
        expect(() =>
          stakingTransaction(
            mockScripts,
            randomAmount,
            dataGenerator.getNativeSegwitAddress(
              dataGenerator.generateRandomKeyPair().publicKey,
            ),
            utxos,
            network,
            feeRate,
            undefined,
            invalidLockHeight,
          ),
        ).toThrow("Invalid lock height");
      });

      it(`${networkName} - should throw an error if the amount is less than or equal to 0`, () => {
        // Test case: amount is 0
        expect(() =>
          stakingTransaction(
            mockScripts,
            0, // Invalid amount
            dataGenerator.getNativeSegwitAddress(
              dataGenerator.generateRandomKeyPair().publicKey,
            ),
            utxos,
            network,
            dataGenerator.generateRandomFeeRates(), // Valid fee rate
          ),
        ).toThrow("Amount and fee rate must be bigger than 0");
    
        // Test case: amount is -1
        expect(() =>
          stakingTransaction(
            mockScripts,
            -1, // Invalid amount
            dataGenerator.getNativeSegwitAddress(
              dataGenerator.generateRandomKeyPair().publicKey,
            ),
            utxos,
            network,
            dataGenerator.generateRandomFeeRates(), // Valid fee rate
          ),
        ).toThrow("Amount and fee rate must be bigger than 0");
      });
  
  
      it("should throw an error if the fee rate is less than or equal to 0", () => {
        // Test case: fee rate is 0
        expect(() =>
          stakingTransaction(
            mockScripts,
            randomAmount,
            dataGenerator.getNativeSegwitAddress(
              dataGenerator.generateRandomKeyPair().publicKey,
            ),
            utxos,
            network,
            0, // Invalid fee rate
          ),
        ).toThrow("Amount and fee rate must be bigger than 0");
    
        // Test case: fee rate is -1
        expect(() =>
          stakingTransaction(
            mockScripts,
            randomAmount,
            dataGenerator.getNativeSegwitAddress(
              dataGenerator.generateRandomKeyPair().publicKey,
            ),
            utxos,
            network,
            -1, // Invalid fee rate
          ),
        ).toThrow("Amount and fee rate must be bigger than 0");
      });
    }});

    describe("Happy path", () => {
      it(`${networkName} - should return a valid psbt result`, () => {
        const psbtResult = stakingTransaction(
          mockScripts,
          randomAmount,
          changeAddress,
          utxos,
          network,
          feeRate,
        )
        validateCommonFields(psbtResult, randomAmount, estimatedFee, changeAddress, mockScripts)
      });
  
      it(`${networkName} - should return a valid psbt result with tapInternalKey`, () => {
        const psbtResult = stakingTransaction(
          mockScripts,
          randomAmount,
          changeAddress,
          utxos,
          network,
          feeRate,
          Buffer.from(
            dataGenerator.generateRandomKeyPair(true).publicKey,
            "hex",
          ),
        )
        validateCommonFields(psbtResult, randomAmount, estimatedFee, changeAddress, mockScripts)
      });
  
      it(`${networkName} - should return a valid psbt result with lock field`, () => {
        const lockHeight = Math.floor(Math.random() * 1000000) + 100;
        const psbtResult = stakingTransaction(
          mockScripts,
          randomAmount,
          changeAddress,
          utxos,
          network,
          feeRate,
          Buffer.from(
            dataGenerator.generateRandomKeyPair(true).publicKey,
            "hex",
          ),
          lockHeight,
        )
        validateCommonFields(psbtResult, randomAmount, estimatedFee, changeAddress, mockScripts)
        // check the lock height is correct
        expect(psbtResult.psbt.locktime).toEqual(lockHeight)
      });
    });    
  });
});

const validateCommonFields = (
  psbtResult: PsbtTransactionResult, randomAmount: number, estimatedFee: number, 
  changeAddress: string, mockScripts: StakingScripts,
) => {
  expect(psbtResult).toBeDefined();
  // Expect not be too far from the estimated fee
  expect(Math.abs(psbtResult.fee-estimatedFee)).toBeLessThan(1000)
  // make sure the input amount is greater than the output amount
  const { psbt, fee} = psbtResult;
  const inputAmount = psbt.data.inputs.reduce((sum, input) => sum + input.witnessUtxo!.value, 0);
  const outputAmount = psbt.txOutputs.reduce((sum, output) => sum + output.value, 0);
  expect(inputAmount).toBeGreaterThan(outputAmount)
  expect(inputAmount - outputAmount).toEqual(fee)
  // check the change amount is correct and send to the correct address
  if (inputAmount - (randomAmount + fee) > BTC_DUST_SAT) {
    const expectedChangeAmount = inputAmount - (randomAmount + fee);
    const changeOutput = psbt.txOutputs.find(output => output.value === expectedChangeAmount);
    expect(changeOutput).toBeDefined();
    // also make sure the change address is correct by look up the `address`
    expect(psbt.txOutputs.find(output => output.address === changeAddress)).toBeDefined();
  }

  // check data embed output added to the transaction
  expect(psbt.txOutputs.find(output => output.script.equals(mockScripts.dataEmbedScript))).toBeDefined();

  // Check the staking amount is correct
  expect(psbt.txOutputs.find(output => output.value === randomAmount)).toBeDefined();
}