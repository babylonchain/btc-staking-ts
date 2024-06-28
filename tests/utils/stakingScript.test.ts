import { StakingScriptData } from "../../src/utils/stakingScript";

describe("stakingScript", () => {
  describe("Input Fields Validation", () => {
    const pk1 = Buffer.from("6f13a6d104446520d1757caec13eaf6fbcf29f488c31e0107e7351d4994cd068", "hex");
    const pk2 = Buffer.from("f5199efae3f28bb82476163a7e458c7ad445d9bffb0682d10d3bdb2cb41f8e8e", "hex");
    const pk3 = Buffer.from("17921cf156ccb4e73d428f996ed11b245313e37e27c978ac4d2cc21eca4672e4", "hex");
    const pk4 = Buffer.from("76d1ae01f8fb6bf30108731c884cddcf57ef6eef2d9d9559e130894e0e40c62c", "hex");
    const pk5 = Buffer.from("49766ccd9e3cd94343e2040474a77fb37cdfd30530d05f9f1e96ae1e2102c86e", "hex");
    const invalidPk = Buffer.from("6f13a6d104446520d1757caec13eaf6fbcf29f488c31e0107e7351d4994cd0", "hex");
    const emptyBuffer = Buffer.from("", "hex");
    const stakingTimeLock = 65535;
    const unbondingTimeLock = 1000;
    const magicBytes = Buffer.from("62626234", "hex");
    it("should fail if the staker key is not 32 bytes", () => {
      expect(() =>
        new StakingScriptData(
          invalidPk, // Staker Pk
          [pk2], // Finality Provider Pks
          [pk3, pk4, pk5], // covenant Pks
          2,
          stakingTimeLock,
          unbondingTimeLock,
          magicBytes
        )
      ).toThrow("Invalid script data provided");
    });
    it("should fail if a finality provider key is not 32 bytes", () => {
      expect(() =>
        new StakingScriptData(
          pk1, // Staker Pk
          [pk2, invalidPk], // Finality Provider Pks
          [pk3, pk4, pk5], // covenant Pks
          2,
          stakingTimeLock,
          unbondingTimeLock,
          magicBytes
        )
      ).toThrow("Invalid script data provided");
    });
    it("should fail if a covenant emulator key is not 32 bytes", () => {
      expect(() =>
        new StakingScriptData(
          pk1, // Staker Pk
          [pk2, pk3], // Finality Provider Pks
          [pk4, invalidPk, pk5], // covenant Pks
          2,
          stakingTimeLock,
          unbondingTimeLock,
          magicBytes
        )
      ).toThrow("Invalid script data provided");
    });
    it("should fail if the covenant emulators threshold is 0", () => {
      expect(() =>
        new StakingScriptData(
          pk1, // Staker Pk
          [pk2], // Finality Provider Pks
          [pk3, pk4, pk5], // covenant Pks
          0,
          stakingTimeLock,
          unbondingTimeLock,
          magicBytes
        )
      ).toThrow("Missing required input values");
    });
    it("should fail if the covenant emulators threshold is larger than the covenant emulators", () => {
      expect(() =>
        new StakingScriptData(
          pk1, // Staker Pk
          [pk2], // Finality Provider Pks
          [pk3, pk4, pk5], // covenant Pks
          4,
          stakingTimeLock,
          unbondingTimeLock,
          magicBytes
        )
      ).toThrow("Invalid script data provided");
    });
    it("should fail if the staking timelock is 0", () => {
      expect(() =>
        new StakingScriptData(
          pk1, // Staker Pk
          [pk2], // Finality Provider Pks
          [pk3, pk4, pk5], // covenant Pks
          2,
          0,
          unbondingTimeLock,
          magicBytes
        )
      ).toThrow("Missing required input values");
    });
    it("should fail if the staking timelock is above the maximum", () => {
      expect(() =>
        new StakingScriptData(
          pk1, // Staker Pk
          [pk2], // Finality Provider Pks
          [pk3, pk4, pk5], // covenant Pks
          2,
          65536,
          unbondingTimeLock,
          magicBytes
        )
      ).toThrow("Invalid script data provided");
    });
    it("should fail if the unbonding timelock is 0", () => {
      expect(() =>
        new StakingScriptData(
          pk1, // Staker Pk
          [pk2], // Finality Provider Pks
          [pk3, pk4, pk5], // covenant Pks
          2,
          stakingTimeLock,
          0,
          magicBytes
        )
      ).toThrow("Missing required input values");
    });
    it("should fail if the unbonding timelock is above the maximum", () => {
      expect(() =>
        new StakingScriptData(
          pk1, // Staker Pk
          [pk2], // Finality Provider Pks
          [pk3, pk4, pk5], // covenant Pks
          2,
          stakingTimeLock,
          65536,
          magicBytes
        )
      ).toThrow("Invalid script data provided");
    });
    it("should fail if the staker pk is in the finality providers list", () => {
      expect(() =>
        new StakingScriptData(
          pk1, // Staker Pk
          [pk2, pk1], // Finality Provider Pks
          [pk3, pk4, pk5], // covenant Pks
          2,
          stakingTimeLock,
          unbondingTimeLock,
          magicBytes
        )
      ).toThrow("Invalid script data provided");
    });
    it("should fail if the staker pk is in the covenants list", () => {
      expect(() =>
        new StakingScriptData(
          pk1, // Staker Pk
          [pk2], // Finality Provider Pks
          [pk3, pk1, pk4, pk5], // covenant Pks
          2,
          stakingTimeLock,
          unbondingTimeLock,
          magicBytes
        )
      ).toThrow("Invalid script data provided");
    });
    it("should fail if a finality provider pk is in the covenants list", () => {
      expect(() =>
        new StakingScriptData(
          pk1, // Staker Pk
          [pk2], // Finality Provider Pks
          [pk2, pk3, pk4, pk5], // covenant Pks
          2,
          stakingTimeLock,
          unbondingTimeLock,
          magicBytes
        )
      ).toThrow("Invalid script data provided");
    });
    it("should fail if the magic bytes are below 4 in length", () => {
      expect(() =>
        new StakingScriptData(
          pk1, // Staker Pk
          [pk2], // Finality Provider Pks
          [pk3, pk4, pk5], // covenant Pks
          2,
          stakingTimeLock,
          unbondingTimeLock,
          Buffer.from("aaaaaa", "hex")
        )
      ).toThrow("Invalid script data provided");
    });
    it("should fail if the magic bytes are above 4 in length", () => {
      expect(() =>
        new StakingScriptData(
          pk1, // Staker Pk
          [pk2], // Finality Provider Pks
          [pk3, pk4, pk5], // covenant Pks
          2,
          stakingTimeLock,
          unbondingTimeLock,
          Buffer.from("aaaaaaaaaa", "hex")
        )
      ).toThrow("Invalid script data provided");
    });
  });
});
