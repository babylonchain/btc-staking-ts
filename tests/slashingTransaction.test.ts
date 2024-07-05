import { payments } from "bitcoinjs-lib";
import {
  slashEarlyUnbondedTransaction,
  slashTimelockUnbondedTransaction,
  unbondingTransaction,
} from "../src";
import { BTC_DUST_SAT } from "../src/constants/dustSat";
import { internalPubkey } from "../src/constants/internalPubkey";
import { DEFAULT_TEST_FEE_RATE, testingNetworks } from "./helper";

describe("slashingTransaction - ", () => {
  testingNetworks.map(({ network, networkName, dataGenerator }) => {
    const stakerKeyPair = dataGenerator.generateRandomKeyPair();
    const slashingAddress = dataGenerator.getAddressAndScriptPubKey(
      stakerKeyPair.publicKey,
    ).nativeSegwit.address;
    const stakingScripts =
      dataGenerator.generateMockStakingScripts(stakerKeyPair);
    const stakingAmount =
      dataGenerator.getRandomIntegerBetween(1000, 100000) + 10000;
    const stakingTx = dataGenerator.generateRandomStakingTransaction(
      stakerKeyPair,
      DEFAULT_TEST_FEE_RATE,
      stakingAmount,
    );
    const slashingRate = Math.random();
    const slashingAmount = Math.floor(stakingAmount * slashingRate);
    const minSlashingFee = dataGenerator.getRandomIntegerBetween(
      1,
      stakingAmount - slashingAmount - 1,
    );
    const defaultOutputIndex = 0;

    describe(`${networkName} - slashTimelockUnbondedTransaction`, () => {
      it("should throw an error if the slashing rate is not between 0 and 1", () => {
        expect(() =>
          slashTimelockUnbondedTransaction(
            stakingScripts,
            stakingTx,
            slashingAddress,
            0,
            minSlashingFee,
            network,
            defaultOutputIndex,
          ),
        ).toThrow("Slashing rate must be between 0 and 1");

        expect(() =>
          slashTimelockUnbondedTransaction(
            stakingScripts,
            stakingTx,
            slashingAddress,
            -0.1,
            minSlashingFee,
            network,
            defaultOutputIndex,
          ),
        ).toThrow("Slashing rate must be between 0 and 1");

        expect(() =>
          slashTimelockUnbondedTransaction(
            stakingScripts,
            stakingTx,
            slashingAddress,
            1,
            minSlashingFee,
            network,
            defaultOutputIndex,
          ),
        ).toThrow("Slashing rate must be between 0 and 1");

        expect(() =>
          slashTimelockUnbondedTransaction(
            stakingScripts,
            stakingTx,
            slashingAddress,
            1.1,
            minSlashingFee,
            network,
            defaultOutputIndex,
          ),
        ).toThrow("Slashing rate must be between 0 and 1");
      });

      it("should throw an error if minimum slashing fee is less than 0", () => {
        expect(() =>
          slashTimelockUnbondedTransaction(
            stakingScripts,
            stakingTx,
            slashingAddress,
            slashingRate,
            0,
            network,
            defaultOutputIndex,
          ),
        ).toThrow("Minimum fee must be a positve integer");
      });

      it("should throw an error if minimum slashing fee is not integer", () => {
        expect(() =>
          slashTimelockUnbondedTransaction(
            stakingScripts,
            stakingTx,
            slashingAddress,
            slashingRate,
            1.2,
            network,
            defaultOutputIndex,
          ),
        ).toThrow("Minimum fee must be a positve integer");
      });

      it("should throw an error if the output index is less than 0", () => {
        expect(() =>
          slashTimelockUnbondedTransaction(
            stakingScripts,
            stakingTx,
            slashingAddress,
            slashingRate,
            minSlashingFee,
            network,
            -1,
          ),
        ).toThrow("Output index must be an integer bigger or equal to 0");
      });

      it("should throw an error if the output index is not integer", () => {
        expect(() =>
          slashTimelockUnbondedTransaction(
            stakingScripts,
            stakingTx,
            slashingAddress,
            slashingRate,
            minSlashingFee,
            network,
            1.2,
          ),
        ).toThrow("Output index must be an integer bigger or equal to 0");

        expect(() =>
          slashTimelockUnbondedTransaction(
            stakingScripts,
            stakingTx,
            slashingAddress,
            slashingRate,
            minSlashingFee,
            network,
            0.5,
          ),
        ).toThrow("Output index must be an integer bigger or equal to 0");
      });

      it("should throw an error if the output index is greater than the number of outputs", () => {
        expect(() =>
          slashTimelockUnbondedTransaction(
            stakingScripts,
            stakingTx,
            slashingAddress,
            slashingRate,
            minSlashingFee,
            network,
            stakingTx.outs.length,
          ),
        ).toThrow("Output index is out of range");
      });

      it("should throw not enough funds error if stake amount can not cover the slashing amount", () => {
        // Make sure we can't cover the slashing amount
        const amount = dataGenerator.getRandomIntegerBetween(
          BTC_DUST_SAT,
          BTC_DUST_SAT + 100000,
        );
        const txWithLimitedAmount =
          dataGenerator.generateRandomStakingTransaction(
            stakerKeyPair,
            DEFAULT_TEST_FEE_RATE,
            amount,
          );
        expect(() =>
          slashTimelockUnbondedTransaction(
            stakingScripts,
            txWithLimitedAmount,
            slashingAddress,
            slashingRate,
            Math.ceil(amount * (1 - slashingRate) + 1),
            network,
            0,
          ),
        ).toThrow("Not enough funds to slash, stake more");
      });

      it("should throw an error if slashing rate is too low", () => {
        const amount = 1000; // this is to make sure greater than dust
        const tx = dataGenerator.generateRandomStakingTransaction(
          stakerKeyPair,
          DEFAULT_TEST_FEE_RATE,
          amount,
        );
        expect(() =>
          slashTimelockUnbondedTransaction(
            stakingScripts,
            tx,
            slashingAddress,
            0.0001,
            1,
            network,
            defaultOutputIndex,
          ),
        ).toThrow("Slashing rate is too low");
      });

      it("should create the slashing time lock unbonded tx psbt successfully", () => {
        const { psbt } = slashTimelockUnbondedTransaction(
          stakingScripts,
          stakingTx,
          slashingAddress,
          slashingRate,
          minSlashingFee,
          network,
          0,
        );

        expect(psbt).toBeDefined();
        expect(psbt.txOutputs.length).toBe(2);
        // first output shall send slashed amount to the slashing address
        expect(psbt.txOutputs[0].address).toBe(slashingAddress);
        expect(psbt.txOutputs[0].value).toBe(
          Math.floor(stakingAmount * slashingRate),
        );

        // second output is the change output which send to unbonding timelock script address
        const changeOutput = payments.p2tr({
          internalPubkey,
          scriptTree: { output: stakingScripts.unbondingTimelockScript },
          network,
        });
        expect(psbt.txOutputs[1].address).toBe(changeOutput.address);
        const expectedChangeOutputValue =
          stakingAmount -
          Math.floor(stakingAmount * slashingRate) -
          minSlashingFee;
        expect(psbt.txOutputs[1].value).toBe(expectedChangeOutputValue);
      });
    });

    describe(`${networkName} slashEarlyUnbondedTransaction - `, () => {
      const unbondingTx = unbondingTransaction(
        stakingScripts,
        stakingTx,
        1,
        network,
      )
        .psbt.signAllInputs(stakerKeyPair.keyPair)
        .finalizeAllInputs()
        .extractTransaction();

      it("should throw an error if the slashing rate is not between 0 and 1", () => {
        expect(() =>
          slashEarlyUnbondedTransaction(
            stakingScripts,
            unbondingTx,
            slashingAddress,
            0,
            minSlashingFee,
            network,
          ),
        ).toThrow("Slashing rate must be between 0 and 1");

        expect(() =>
          slashEarlyUnbondedTransaction(
            stakingScripts,
            unbondingTx,
            slashingAddress,
            -0.1,
            minSlashingFee,
            network,
          ),
        ).toThrow("Slashing rate must be between 0 and 1");

        expect(() =>
          slashEarlyUnbondedTransaction(
            stakingScripts,
            unbondingTx,
            slashingAddress,
            1,
            minSlashingFee,
            network,
          ),
        ).toThrow("Slashing rate must be between 0 and 1");

        expect(() =>
          slashEarlyUnbondedTransaction(
            stakingScripts,
            unbondingTx,
            slashingAddress,
            1.1,
            minSlashingFee,
            network,
          ),
        ).toThrow("Slashing rate must be between 0 and 1");
      });

      it("should throw an error if minimum slashing fee is less than 0", () => {
        expect(() =>
          slashEarlyUnbondedTransaction(
            stakingScripts,
            unbondingTx,
            slashingAddress,
            slashingRate,
            0,
            network,
          ),
        ).toThrow("Minimum fee must be a positve integer");
      });

      it("should throw not enough funds error if stake amount can not cover the slashing amount", () => {
        // Make sure we can't cover the slashing amount
        const amount = dataGenerator.getRandomIntegerBetween(
          BTC_DUST_SAT,
          BTC_DUST_SAT + 100000,
        ); // +1 is to make sure cover the unbondingTx fee
        const txWithLimitedAmount =
          dataGenerator.generateRandomStakingTransaction(
            stakerKeyPair,
            DEFAULT_TEST_FEE_RATE,
            amount,
          );
        const unbondingTxWithLimitedAmount = unbondingTransaction(
          stakingScripts,
          txWithLimitedAmount,
          1,
          network,
        )
          .psbt.signAllInputs(stakerKeyPair.keyPair)
          .finalizeAllInputs()
          .extractTransaction();
        expect(() =>
          slashEarlyUnbondedTransaction(
            stakingScripts,
            unbondingTxWithLimitedAmount,
            slashingAddress,
            slashingRate,
            Math.ceil(amount * (1 - slashingRate) + 1),
            network,
          ),
        ).toThrow("Not enough funds to slash, stake more");
      });

      it("should throw an error if slashing rate is too low", () => {
        const amount = 1000; // Make sure greater than dust
        const tx = dataGenerator.generateRandomStakingTransaction(
          stakerKeyPair,
          DEFAULT_TEST_FEE_RATE,
          amount,
        );
        const lowAmountUnbondingTx = unbondingTransaction(
          stakingScripts,
          tx,
          1,
          network,
        )
          .psbt.signAllInputs(stakerKeyPair.keyPair)
          .finalizeAllInputs()
          .extractTransaction();
        expect(() =>
          slashEarlyUnbondedTransaction(
            stakingScripts,
            lowAmountUnbondingTx,
            slashingAddress,
            0.0001,
            1,
            network,
          ),
        ).toThrow("Slashing rate is too low");
      });

      it("should create the slashing time lock unbonded tx psbt successfully", () => {
        const { psbt } = slashEarlyUnbondedTransaction(
          stakingScripts,
          unbondingTx,
          slashingAddress,
          slashingRate,
          minSlashingFee,
          network,
        );

        const unbondingTxOutputValue = unbondingTx.outs[0].value;

        expect(psbt).toBeDefined();
        expect(psbt.txOutputs.length).toBe(2);
        // first output shall send slashed amount to the slashing address
        expect(psbt.txOutputs[0].address).toBe(slashingAddress);
        expect(psbt.txOutputs[0].value).toBe(
          Math.floor(unbondingTxOutputValue * slashingRate),
        );

        // second output is the change output which send to unbonding timelock script address
        const changeOutput = payments.p2tr({
          internalPubkey,
          scriptTree: { output: stakingScripts.unbondingTimelockScript },
          network,
        });
        expect(psbt.txOutputs[1].address).toBe(changeOutput.address);
        const expectedChangeOutputValue =
          unbondingTxOutputValue -
          Math.floor(unbondingTxOutputValue * slashingRate) -
          minSlashingFee;
        expect(psbt.txOutputs[1].value).toBe(expectedChangeOutputValue);
      });

      it("should create the slashingTx without slashing amount if its value is less than dust", () => {
        const smallSlashingRate = BTC_DUST_SAT / stakingAmount;
        const { psbt } = slashEarlyUnbondedTransaction(
          stakingScripts,
          unbondingTx,
          slashingAddress,
          smallSlashingRate,
          minSlashingFee,
          network,
        );

        const unbondingTxOutputValue = unbondingTx.outs[0].value;

        expect(psbt).toBeDefined();
        expect(psbt.txOutputs.length).toBe(1);
        // first output shall send slashed amount to the slashing address
        const changeOutput = payments.p2tr({
          internalPubkey,
          scriptTree: { output: stakingScripts.unbondingTimelockScript },
          network,
        });
        expect(psbt.txOutputs[0].address).toBe(changeOutput.address);
        const expectedChangeOutputValue =
          unbondingTxOutputValue -
          Math.floor(unbondingTxOutputValue * smallSlashingRate) -
          minSlashingFee;
        expect(psbt.txOutputs[0].value).toBe(expectedChangeOutputValue);
      });
    });
  });
});
