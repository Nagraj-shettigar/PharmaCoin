export interface RewardConfig {
  pointsPerHundredRupees: number;
  rupeeValuePerPoint: number;
  minBillAmountToEarn: number;
  minBillAmountToRedeem: number;
  maxRedemptionPercentage: number;
}

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  pointsPerHundredRupees: 1,
  rupeeValuePerPoint: 1,
  minBillAmountToEarn: 100,
  minBillAmountToRedeem: 200,
  maxRedemptionPercentage: 50,
};
