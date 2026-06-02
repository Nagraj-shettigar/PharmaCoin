import { Injectable, inject, signal } from '@angular/core';
import { RewardConfig, DEFAULT_REWARD_CONFIG } from '../models/reward-config.model';
import { StorageService } from './storage.service';

const STORAGE_KEY = 'hp_reward_config';

@Injectable({ providedIn: 'root' })
export class RewardService {
  private storage = inject(StorageService);
  private config = signal<RewardConfig>(DEFAULT_REWARD_CONFIG);

  constructor() {
    const saved = this.storage.get<RewardConfig>(STORAGE_KEY);
    if (saved) this.config.set(saved);
  }

  getConfig() {
    return this.config;
  }

  updateConfig(config: RewardConfig): void {
    this.config.set(config);
    this.storage.set(STORAGE_KEY, config);
  }

  calculateEarnedPoints(billAmount: number): number {
    const cfg = this.config();
    if (billAmount < cfg.minBillAmountToEarn) return 0;
    return Math.floor((billAmount / 100) * cfg.pointsPerHundredRupees);
  }

  calculateMaxRedeemable(
    pointsBalance: number,
    billAmount: number
  ): { maxPoints: number; maxValue: number } {
    const cfg = this.config();
    if (billAmount < cfg.minBillAmountToRedeem) {
      return { maxPoints: 0, maxValue: 0 };
    }
    const maxValueFromBill = (billAmount * cfg.maxRedemptionPercentage) / 100;
    const maxValueFromPoints = pointsBalance * cfg.rupeeValuePerPoint;
    const maxValue = Math.min(maxValueFromBill, maxValueFromPoints);
    const maxPoints = Math.floor(maxValue / cfg.rupeeValuePerPoint);
    return { maxPoints, maxValue };
  }

  pointsToRupees(points: number): number {
    return points * this.config().rupeeValuePerPoint;
  }
}
