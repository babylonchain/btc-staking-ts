import { Transaction, script } from "bitcoinjs-lib";
import {
  initBTCCurve,
  withdrawEarlyUnbondedTransaction,
  withdrawTimelockUnbondedTransaction,
} from "../src/index";
import { StakingScripts } from "../src/types/StakingScripts";
import { PsbtTransactionResult } from "../src/types/transaction";
import { testingNetworks } from "./helper";
import { DEFAULT_TEST_FEE_RATE, KeyPair } from "./helper/dataGenerator";
import { NetworkConfig } from "./helper/testingNetworks";
import { BTC_DUST_SAT } from "../src/constants/dustSat";

interface WithdrawTransactionTestData {
  keyPair: KeyPair;
  address: string;
  stakingScripts: StakingScripts;
  stakingTx: Transaction;
}

describe("withdrawTransaction", () => {
  beforeAll(() => {
    initBTCCurve();
  });

  const setupTestData = (
    network: NetworkConfig,
  ): WithdrawTransactionTestData => {
    const dataGenerator = network.dataGenerator;
    const stakerKeyPair = dataGenerator.generateRandomKeyPair();

    const address = dataGenerator.getAddressAndScriptPubKey(stakerKeyPair.publicKey).nativeSegwit.address;
    const stakingScripts = dataGenerator.generateMockStakingScripts(stakerKeyPair);
    const stakingTx = dataGenerator.generateRandomStakingTransaction(
      stakerKeyPair,
    );

    return {
      keyPair: stakerKeyPair,
      address,
      stakingScripts,
      stakingTx,
    };
  };

  testingNetworks.map(({ networkName, network, dataGenerator }) => {
    let testData: WithdrawTransactionTestData;

    beforeEach(() => {
      jest.restoreAllMocks();
      testData = setupTestData({ networkName, network, dataGenerator });
    });

    it(`${networkName} - should throw an error if the fee rate is less than or equal to 0`, () => {
      expect(() =>
        withdrawEarlyUnbondedTransaction(
          {
            unbondingTimelockScript:
              testData.stakingScripts.unbondingTimelockScript,
            slashingScript: testData.stakingScripts.slashingScript,
          },
          testData.stakingTx,
          testData.address,
          network,
          0,
        ),
      ).toThrow("Withdrawal feeRate must be bigger than 0");

      expect(() =>
        withdrawTimelockUnbondedTransaction(
          {
            timelockScript: testData.stakingScripts.timelockScript,
            slashingScript: testData.stakingScripts.slashingScript,
            unbondingScript: testData.stakingScripts.unbondingScript,
          },
          testData.stakingTx,
          testData.address,
          network,
          0,
        ),
      ).toThrow("Withdrawal feeRate must be bigger than 0");

      expect(() =>
        withdrawEarlyUnbondedTransaction(
          {
            unbondingTimelockScript:
              testData.stakingScripts.unbondingTimelockScript,
            slashingScript: testData.stakingScripts.slashingScript,
          },
          testData.stakingTx,
          testData.address,
          network,
          -1,
        ),
      ).toThrow("Withdrawal feeRate must be bigger than 0");

      expect(() =>
        withdrawTimelockUnbondedTransaction(
          {
            timelockScript: testData.stakingScripts.timelockScript,
            slashingScript: testData.stakingScripts.slashingScript,
            unbondingScript: testData.stakingScripts.unbondingScript,
          },
          testData.stakingTx,
          testData.address,
          network,
          -1,
        ),
      ).toThrow("Withdrawal feeRate must be bigger than 0");
    });

    it(`${networkName} - should throw an error if the timelock script is not valid`, () => {
      // mock decompile to return null
      jest.spyOn(script, "decompile").mockReturnValue(null);
      expect(() =>
        withdrawTimelockUnbondedTransaction(
          {
            timelockScript: Buffer.alloc(1),
            slashingScript: testData.stakingScripts.slashingScript,
            unbondingScript: testData.stakingScripts.unbondingScript,
          },
          testData.stakingTx,
          testData.address,
          network,
          DEFAULT_TEST_FEE_RATE,
        ),
      ).toThrow("Timelock script is not valid");
    });

    it(`${networkName} - should throw an error if output index is invalid`, () => {
      expect(() =>
        withdrawTimelockUnbondedTransaction(
          {
            timelockScript: testData.stakingScripts.timelockScript,
            slashingScript: testData.stakingScripts.slashingScript,
            unbondingScript: testData.stakingScripts.unbondingScript,
          },
          testData.stakingTx,
          testData.address,
          network,
          DEFAULT_TEST_FEE_RATE,
          -1,
        ),
      ).toThrow("Output index must be bigger or equal to 0");
    });

    it(`${networkName} - should throw if not enough funds to cover fees`, () => {
      const keyPair = dataGenerator.generateRandomKeyPair();

      const address = dataGenerator.getAddressAndScriptPubKey(keyPair.publicKey).nativeSegwit.address;
      const stakingScripts = dataGenerator.generateMockStakingScripts(keyPair);
      const amount = dataGenerator.getRandomIntegerBetween(1, 1000);
      const stakingTx = dataGenerator.generateRandomStakingTransaction(
        keyPair,
        DEFAULT_TEST_FEE_RATE,
        amount,
      );

      expect(() => withdrawEarlyUnbondedTransaction(
        {
          unbondingTimelockScript:
            stakingScripts.unbondingTimelockScript,
          slashingScript: stakingScripts.slashingScript,
        },
        stakingTx,
        address,
        network,
        DEFAULT_TEST_FEE_RATE,
      )).toThrow("Not enough funds to cover the fee for withdrawal transaction");
    });

    it(`${networkName} - should throw if output is less than dust limit`, () => {
      const keyPair = dataGenerator.generateRandomKeyPair();

      const address = dataGenerator.getAddressAndScriptPubKey(keyPair.publicKey).nativeSegwit.address;
      const stakingScripts = dataGenerator.generateMockStakingScripts(keyPair);
      const amount = 1935 + BTC_DUST_SAT - 1; // 1935 is the manually calculated fee for the transaction
      const stakingTx = dataGenerator.generateRandomStakingTransaction(
        keyPair,
        DEFAULT_TEST_FEE_RATE,
        amount,
      );

      expect(() => withdrawEarlyUnbondedTransaction(
        {
          unbondingTimelockScript:
            stakingScripts.unbondingTimelockScript,
          slashingScript: stakingScripts.slashingScript,
        },
        stakingTx,
        address,
        network,
        DEFAULT_TEST_FEE_RATE,
      )).toThrow("Output value is less than dust limit");
    });

    it(`${networkName} - should return a valid psbt result for early unbonded transaction`, () => {
      const psbtResult = withdrawEarlyUnbondedTransaction(
        {
          unbondingTimelockScript:
            testData.stakingScripts.unbondingTimelockScript,
          slashingScript: testData.stakingScripts.slashingScript,
        },
        testData.stakingTx,
        testData.address,
        network,
        DEFAULT_TEST_FEE_RATE,
      );
      validateCommonFields(psbtResult, testData.address);
    });

    it(`${networkName} - should return a valid psbt result for timelock unbonded transaction`, () => {
      const psbtResult = withdrawTimelockUnbondedTransaction(
        {
          timelockScript: testData.stakingScripts.timelockScript,
          slashingScript: testData.stakingScripts.slashingScript,
          unbondingScript: testData.stakingScripts.unbondingScript,
        },
        testData.stakingTx,
        testData.address,
        network,
        DEFAULT_TEST_FEE_RATE,
      );
      validateCommonFields(psbtResult, testData.address);
    });
  });
});

const validateCommonFields = (
  psbtResult: PsbtTransactionResult,
  withdrawalAddress: string,
) => {
  expect(psbtResult).toBeDefined();
  const { psbt, fee } = psbtResult;
  const inputAmount = psbt.data.inputs.reduce(
    (sum, input) => sum + input.witnessUtxo!.value,
    0,
  );
  const outputAmount = psbt.txOutputs.reduce(
    (sum, output) => sum + output.value,
    0,
  );
  expect(inputAmount).toBeGreaterThan(outputAmount);
  expect(inputAmount - outputAmount).toEqual(fee);
  expect(
    psbt.txOutputs.find((output) => output.address === withdrawalAddress),
  ).toBeDefined();
};
