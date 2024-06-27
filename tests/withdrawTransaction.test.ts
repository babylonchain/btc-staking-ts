import { Transaction } from "bitcoinjs-lib";
import { testingNetworks } from "./helper";
import { NetworkConfig } from "./helper/testingNetworks";
import { PsbtTransactionResult } from "../src/types/transaction";
import {
  initBTCCurve,
  withdrawEarlyUnbondedTransaction,
  withdrawTimelockUnbondedTransaction,
} from "../src/index";
import { KeyPair } from "./helper/dataGenerator";
import { StakingScripts } from "../src/types/StakingScripts";

interface WithdrawTransactionTestData {
  feeRate: number;
  keyPair: KeyPair;
  address: string;
  stakingScripts: StakingScripts,
  transaction: Transaction;
}

describe("withdrawTransaction", () => {
  beforeAll(() => {
    initBTCCurve();
  });

  
  const setupTestData = (network: NetworkConfig): WithdrawTransactionTestData => {
    const feeRate = 1;
    const dataGenerator = network.dataGenerator;
    const keyPair = dataGenerator.generateRandomKeyPair();
    const address = dataGenerator.getNativeSegwitAddress(keyPair.publicKey);
    const stakingScripts = dataGenerator.generateMockStakingScripts();
    const transaction = dataGenerator.generateRandomStakingTransaction(
      network.network,
      feeRate,
      keyPair,
      address,
      stakingScripts
    )

    return {
      feeRate,
      keyPair,
      address,
      stakingScripts,
      transaction,
    };
  };

  testingNetworks.map(({ networkName, network, dataGenerator }) => {
    let testData: WithdrawTransactionTestData;
    

      beforeAll(() => {
        testData = setupTestData({networkName, network, dataGenerator});
      });

      describe("Error path", () => {
        it(`${networkName} - should throw an error if the fee rate is less than or equal to 0`, () => {
          expect(() =>
            withdrawEarlyUnbondedTransaction(
              {
                unbondingTimelockScript: testData.stakingScripts.unbondingTimelockScript,
                slashingScript: testData.stakingScripts.slashingScript,
              },
              testData.transaction,
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
              testData.transaction,
              testData.address,
              network,
              0,
            ),
          ).toThrow("Withdrawal feeRate must be bigger than 0");

          expect(() =>
            withdrawEarlyUnbondedTransaction(
              {
                unbondingTimelockScript: testData.stakingScripts.unbondingTimelockScript,
                slashingScript: testData.stakingScripts.slashingScript,
              },
              testData.transaction,
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
              testData.transaction,
              testData.address,
              network,
              -1,
            ),
          ).toThrow("Withdrawal feeRate must be bigger than 0");
        });

        it(`${networkName} - should throw an error if output index is invalid`, () => {
          expect(() =>
            withdrawEarlyUnbondedTransaction(
              {
                unbondingTimelockScript: testData.stakingScripts.unbondingTimelockScript,
                slashingScript: testData.stakingScripts.slashingScript,
              },
              testData.transaction,
              testData.address,
              network,
              testData.feeRate,
              -1,
            ),
          ).toThrow("Output index must be bigger or equal to 0");

          expect(() =>
            withdrawTimelockUnbondedTransaction(
              {
                timelockScript: testData.stakingScripts.timelockScript,
                slashingScript: testData.stakingScripts.slashingScript,
                unbondingScript: testData.stakingScripts.unbondingScript,
              },
              testData.transaction,
              testData.address,
              network,
              testData.feeRate,
              -1,
            ),
          ).toThrow("Output index must be bigger or equal to 0");
        });
      });

      describe("Happy path", () => {
        it(`${networkName} - should return a valid psbt result for early unbonded transaction`, () => {
          const psbtResult = withdrawEarlyUnbondedTransaction(
            {
              unbondingTimelockScript: testData.stakingScripts.unbondingTimelockScript,
              slashingScript: testData.stakingScripts.slashingScript,
            },
            testData.transaction,
            testData.address,
            network,
            testData.feeRate,
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
            testData.transaction,
            testData.address,
            network,
            testData.feeRate,
          );
          validateCommonFields(psbtResult, testData.address);
        });
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