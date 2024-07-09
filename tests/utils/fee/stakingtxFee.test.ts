import { UTXO } from "../../../src/types/UTXO";
import { PsbtOutputExtended } from "../../../src/types/psbtOutputs";
import { getStakingTxInputUTXOsAndFees } from "../../../src/utils/fee";
import { buildStakingOutput } from "../../../src/utils/staking";
import { DEFAULT_TEST_FEE_RATE, testingNetworks } from "../../helper";

testingNetworks.forEach(({ networkName, network, dataGenerator }) => {
  describe(`${networkName} - getStakingTxInputUTXOsAndFees`, () => {
    const mockScripts = dataGenerator.generateMockStakingScripts();
    const feeRate = DEFAULT_TEST_FEE_RATE;
    const randomAmount = Math.floor(Math.random() * 100000000) + 1000;

    it("should throw an error if there are no available UTXOs", () => {
      const availableUTXOs: UTXO[] = [];
      const outputs: PsbtOutputExtended[] = [];
      expect(() =>
        getStakingTxInputUTXOsAndFees(
          network,
          availableUTXOs,
          randomAmount,
          feeRate,
          outputs,
        ),
      ).toThrow("Insufficient funds");
    });

    it("should throw if total utxos value can not cover the staking value + fee", () => {
      const availableUTXOs: UTXO[] = dataGenerator.generateRandomUTXOs(
        randomAmount + 1,
        Math.floor(Math.random() * 10) + 1,
      );
      const outputs = buildStakingOutput(mockScripts, network, randomAmount);
      expect(() =>
        getStakingTxInputUTXOsAndFees(
          network,
          availableUTXOs,
          randomAmount,
          feeRate,
          outputs,
        ),
      ).toThrow(
        "Insufficient funds: unable to gather enough UTXOs to cover the staking amount and fees",
      );
    });

    it("should successfully select the correct UTXOs and calculate the fee", () => {
      const availableUTXOs: UTXO[] = dataGenerator.generateRandomUTXOs(
        randomAmount + 10000000, // give enough satoshis to cover the fee
        Math.floor(Math.random() * 10) + 1,
      );
      const outputs = buildStakingOutput(mockScripts, network, randomAmount);

      const result = getStakingTxInputUTXOsAndFees(
        network,
        availableUTXOs,
        randomAmount,
        feeRate,
        outputs,
      );
      // Ensure the correct UTXOs are selected
      expect(result.selectedUTXOs.length).toBeLessThanOrEqual(
        availableUTXOs.length,
      );
      // Ensure the highest value UTXOs are selected
      availableUTXOs.sort((a, b) => b.value - a.value);
      expect(result.selectedUTXOs).toEqual(
        availableUTXOs.slice(0, result.selectedUTXOs.length),
      );
      expect(result.fee).toBeGreaterThan(0);
    });

    it("should successfully return the accurate fee for taproot input", () => {
      const stakeAmount = 2000;
      const { taproot } = dataGenerator.getAddressAndScriptPubKey(
        dataGenerator.generateRandomKeyPair().publicKey,
      );
      const availableUTXOs = [
        {
          txid: dataGenerator.generateRandomTxId(),
          vout: Math.floor(Math.random() * 10),
          scriptPubKey: taproot.scriptPubKey,
          value: 1000,
        },
        {
          txid: dataGenerator.generateRandomTxId(),
          vout: Math.floor(Math.random() * 10),
          scriptPubKey: taproot.scriptPubKey,
          value: 2000,
        },
      ];

      const outputs = buildStakingOutput(mockScripts, network, stakeAmount);
      // Manually setting fee rate less than 2 so that the fee calculation included ESTIMATION_ACCUARACY_BUFFER
      let result = getStakingTxInputUTXOsAndFees(
        network,
        availableUTXOs,
        stakeAmount,
        1,
        outputs,
      );
      expect(result.fee).toBe(325); // This number is calculated manually
      expect(result.selectedUTXOs.length).toEqual(2);

      result = getStakingTxInputUTXOsAndFees(
        network,
        availableUTXOs,
        stakeAmount,
        2,
        outputs,
      );
      expect(result.fee).toBe(534); // This number is calculated manually
      expect(result.selectedUTXOs.length).toEqual(2);

      // Once fee rate is set to 3, the fee will be calculated with addition of TX_BUFFER_SIZE_OVERHEAD * feeRate
      result = getStakingTxInputUTXOsAndFees(
        network,
        availableUTXOs,
        stakeAmount,
        3,
        outputs,
      );
      expect(result.fee).toBe(756); // This number is calculated manually
      expect(result.selectedUTXOs.length).toEqual(2);
    });

    it("should successfully return the accurate fee for native segwit input", () => {
      const stakeAmount = 2000;
      const { nativeSegwit } = dataGenerator.getAddressAndScriptPubKey(
        dataGenerator.generateRandomKeyPair().publicKey,
      );
      const availableUTXOs = [
        {
          txid: dataGenerator.generateRandomTxId(),
          vout: Math.floor(Math.random() * 10),
          scriptPubKey: nativeSegwit.scriptPubKey,
          value: 1000,
        },
        {
          txid: dataGenerator.generateRandomTxId(),
          vout: Math.floor(Math.random() * 10),
          scriptPubKey: nativeSegwit.scriptPubKey,
          value: 2000,
        },
      ];

      const outputs = buildStakingOutput(mockScripts, network, stakeAmount);
      let result = getStakingTxInputUTXOsAndFees(
        network,
        availableUTXOs,
        stakeAmount,
        1,
        outputs,
      );
      expect(result.fee).toBe(345); // This number is calculated manually
      expect(result.selectedUTXOs.length).toEqual(2);
    });

    it("should successfully return the accurate fee without change", () => {
      const stakeAmount = 2000;
      const { nativeSegwit } = dataGenerator.getAddressAndScriptPubKey(
        dataGenerator.generateRandomKeyPair().publicKey,
      );
      const availableUTXOs = [
        {
          txid: dataGenerator.generateRandomTxId(),
          vout: Math.floor(Math.random() * 10),
          scriptPubKey: nativeSegwit.scriptPubKey,
          value: 1009,
        },
        {
          txid: dataGenerator.generateRandomTxId(),
          vout: Math.floor(Math.random() * 10),
          scriptPubKey: nativeSegwit.scriptPubKey,
          value: 1293,
        },
      ];

      const outputs = buildStakingOutput(mockScripts, network, stakeAmount);
      let result = getStakingTxInputUTXOsAndFees(
        network,
        availableUTXOs,
        stakeAmount,
        1,
        outputs,
      );
      expect(result.fee).toBe(302); // This is the fee for 2 inputs and 2 outputs without change
      expect(result.selectedUTXOs.length).toEqual(2);
    });

    it("should successfully return the accurate fee utilising only one of the UTXOs", () => {
      const stakeAmount = 2000;
      const { nativeSegwit } = dataGenerator.getAddressAndScriptPubKey(
        dataGenerator.generateRandomKeyPair().publicKey,
      );
      const availableUTXOs = [
        {
          txid: dataGenerator.generateRandomTxId(),
          vout: Math.floor(Math.random() * 10),
          scriptPubKey: nativeSegwit.scriptPubKey,
          value: 1000,
        },
        {
          txid: dataGenerator.generateRandomTxId(),
          vout: Math.floor(Math.random() * 10),
          scriptPubKey: nativeSegwit.scriptPubKey,
          value: 2500,
        },
      ];

      const outputs = buildStakingOutput(mockScripts, network, stakeAmount);
      let result = getStakingTxInputUTXOsAndFees(
        network,
        availableUTXOs,
        stakeAmount,
        1,
        outputs,
      );
      expect(result.fee).toBe(234);
      expect(result.selectedUTXOs.length).toEqual(1);
    });
  });
});
