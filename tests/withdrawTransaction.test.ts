import { testingNetworks } from "./helper";
import { PsbtTransactionResult } from "../src/types/transaction";
import { TestingNetwork } from "./helper/testingNetworks";
import { WithdrawTransactionTestData } from './types/withdrawTransaction'
import {
  initBTCCurve,
  stakingTransaction,
  withdrawEarlyUnbondedTransaction,
  withdrawTimelockUnbondedTransaction,
} from "../src/index";

describe("withdrawTransaction", () => {
  beforeAll(() => {
    initBTCCurve();
  });

  const setupTestData = (network: TestingNetwork): WithdrawTransactionTestData => {
    const dataGenerator = network.dataGenerator;
    const feeRate = 1;
    const { keyPair, publicKey, publicKeyNoCoord } = dataGenerator.generateRandomKeyPair();
    const address = dataGenerator.getNativeSegwitAddress(publicKey);
    const {
      timelockScript,
      slashingScript,
      unbondingScript,
      unbondingTimelockScript,
    } = dataGenerator.generateMockStakingScripts();

    const randomAmount = Math.floor(Math.random() * 100000000) + 1000;
    const utxos = dataGenerator.generateRandomUTXOs(
      Math.floor(Math.random() * 1000000) + randomAmount,
      Math.floor(Math.random() * 10) + 1,
      publicKey,
    );

    const { psbt } = stakingTransaction(
      { timelockScript, slashingScript, unbondingScript },
      randomAmount,
      address,
      utxos,
      network.network,
      feeRate,
    );
    
    psbt.signInput(0, keyPair);

    psbt.finalizeAllInputs();

    const transaction = psbt.extractTransaction();

    return {
      feeRate,
      keyPair,
      publicKey,
      publicKeyNoCoord,
      address,
      timelockScript,
      slashingScript,
      unbondingScript,
      unbondingTimelockScript,
      randomAmount,
      utxos,
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
                unbondingTimelockScript: testData.unbondingTimelockScript,
                slashingScript: testData.slashingScript,
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
                timelockScript: testData.timelockScript,
                slashingScript: testData.slashingScript,
                unbondingScript: testData.unbondingScript,
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
                unbondingTimelockScript: testData.unbondingTimelockScript,
                slashingScript: testData.slashingScript,
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
                timelockScript: testData.timelockScript,
                slashingScript: testData.slashingScript,
                unbondingScript: testData.unbondingScript,
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
                unbondingTimelockScript: testData.unbondingTimelockScript,
                slashingScript: testData.slashingScript,
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
                timelockScript: testData.timelockScript,
                slashingScript: testData.slashingScript,
                unbondingScript: testData.unbondingScript,
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
              unbondingTimelockScript: testData.unbondingTimelockScript,
              slashingScript: testData.slashingScript,
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
              timelockScript: testData.timelockScript,
              slashingScript: testData.slashingScript,
              unbondingScript: testData.unbondingScript,
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