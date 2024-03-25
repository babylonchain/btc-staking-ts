// Represents the staking scripts used in BTC staking.
export interface StakingScripts {
  timelockScript: Buffer;
  unbondingScript: Buffer;
  slashingScript: Buffer;
  unbondingTimelockScript: Buffer;
  dataEmbedScript: Buffer;
}
