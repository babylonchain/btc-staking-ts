import { initBTCCurve, unbondingTransaction } from "../src";
import { BTC_DUST_SAT } from "../src/constants/dustSat";
import { testingNetworks } from "./helper";

describe("Unbonding Transaction - ", () => {
  beforeAll(() => {
    initBTCCurve();
  });
  testingNetworks.forEach(({ networkName, network, dataGenerator }) => {
    const stakerKeyPair = dataGenerator.generateRandomKeyPair();
    const stakingAmount =
      dataGenerator.getRandomIntegerBetween(1000, 100000) + 10000;
    const stakingTx = dataGenerator.generateRandomStakingTransaction(
      stakerKeyPair,
      undefined,
      stakingAmount,
    );
    const stakingScripts =
      dataGenerator.generateMockStakingScripts(stakerKeyPair);
    describe(`${networkName} - `, () => {
      it("should throw an error if the unbonding fee is not postive number", () => {
        expect(() =>
          unbondingTransaction(stakingScripts, stakingTx, 0, network),
        ).toThrow("Unbonding fee must be bigger than 0");
      });

      it("should throw if output index is negative", () => {
        expect(() =>
          unbondingTransaction(
            stakingScripts,
            stakingTx,
            dataGenerator.getRandomIntegerBetween(1, 10000),
            network,
            -1,
          ),
        ).toThrow("Output index must be bigger or equal to 0");
      });

      it("should throw if output is less than dust limit", () => {
        const unbondingFee = stakingAmount - BTC_DUST_SAT + 1;
        expect(() =>
          unbondingTransaction(
            stakingScripts,
            stakingTx,
            unbondingFee,
            network,
            0,
          ),
        ).toThrow("Output value is less than dust limit");
      });

      it("should return psbt for unbonding transaction", () => {
        const unbondingFee =
          dataGenerator.getRandomIntegerBetween(
            1,
            stakingAmount - BTC_DUST_SAT - 1,
          );
        const { psbt } = unbondingTransaction(
          stakingScripts,
          stakingTx,
          unbondingFee,
          network,
          0,
        );
        expect(psbt).toBeDefined();
        expect(psbt.txOutputs.length).toBe(1);
        // check output value
        expect(psbt.txOutputs[0].value).toBe(stakingAmount - unbondingFee);
      });
    });
  });
});
