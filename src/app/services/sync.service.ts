import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TransactionService } from './transaction.service';
import { StorageService } from './storage.service';
import { SyncConfig, DEFAULT_SYNC_CONFIG } from '../models/sync-config.model';
import { Transaction } from '../models/transaction.model';

const CONFIG_KEY = 'hp_sync_config';
const ACTIVITY_KEY = 'hp_sync_activity';
const MAX_ACTIVITY_ITEMS = 30;

// Fallback used when no Server API URL has been configured in Admin > Sync Settings.
export const DEFAULT_API_V1_BASE = 'http://localhost:4000/api/v1';

export interface SyncActivityItem {
  id: string;
  timestamp: string;
  transactionId: string;
  billNumber: string;
  status: 'synced' | 'failed';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class SyncService {
  private transactionService = inject(TransactionService);
  private storage = inject(StorageService);
  private http = inject(HttpClient);

  config = signal<SyncConfig>(DEFAULT_SYNC_CONFIG);
  lastSyncAttempt = signal<string | null>(null);
  lastSyncSuccess = signal<boolean>(false);
  isSyncing = signal<boolean>(false);
  activity = signal<SyncActivityItem[]>([]);

  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const saved = this.storage.get<SyncConfig>(CONFIG_KEY);
    if (saved) this.config.set(saved);

    const savedActivity = this.storage.get<SyncActivityItem[]>(ACTIVITY_KEY);
    if (savedActivity) this.activity.set(savedActivity);
  }

  updateConfig(cfg: SyncConfig): void {
    this.config.set(cfg);
    this.storage.set(CONFIG_KEY, cfg);
    this.restartAutoSync();
  }

  startAutoSync(): void {
    if (this.intervalId) return;
    const cfg = this.config();
    if (!cfg.enabled || !cfg.apiUrl) return;
    this.intervalId = setInterval(
      () => this.sync(),
      cfg.intervalSeconds * 1000
    );
    this.sync();
  }

  stopAutoSync(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private restartAutoSync(): void {
    this.stopAutoSync();
    this.startAutoSync();
  }

  getConfiguredApiBase(): string | null {
    const apiUrl = this.config().apiUrl?.trim();
    if (!apiUrl) {
      return null;
    }

    return this.resolveApiV1Base(apiUrl);
  }

  /**
   * Resolved `/api/v1` base shared by all backend callers. Uses the configured
   * Server API URL when present, otherwise falls back to the local dev default
   * so a fresh install still talks to a locally running backend.
   */
  apiV1Base(): string {
    return this.getConfiguredApiBase() ?? DEFAULT_API_V1_BASE;
  }

  private resolveApiV1Base(apiUrl: string): string {
    const base = apiUrl.trim().replace(/\/+$/, '');
    if (base.endsWith('/api/v1')) return base;
    if (base.endsWith('/api')) return `${base}/v1`;
    if (base.endsWith('/v1')) return base;
    return `${base}/api/v1`;
  }

  private businessDateFromIso(iso: string): string {
    return iso.slice(0, 10);
  }

  private shouldTreatAsSynced(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 409;
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const responseMessage =
        typeof error.error === 'object' && error.error !== null && 'message' in error.error
          ? String((error.error as { message?: unknown }).message ?? '')
          : '';

      if (responseMessage) {
        return responseMessage;
      }

      if (error.message) {
        return error.message;
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown sync error';
  }

  private pushActivityItem(item: Omit<SyncActivityItem, 'id' | 'timestamp'>): void {
    const next: SyncActivityItem = {
      ...item,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };

    const updated = [next, ...this.activity()].slice(0, MAX_ACTIVITY_ITEMS);
    this.activity.set(updated);
    this.storage.set(ACTIVITY_KEY, updated);
  }

  clearActivity(): void {
    this.activity.set([]);
    this.storage.set(ACTIVITY_KEY, []);
  }

  private async syncSingleTransaction(
    apiV1Base: string,
    context: { organizationId: string; storeId: string },
    transaction: Transaction
  ): Promise<{ status: 'synced' | 'failed'; message: string }> {
    const payload = {
      organizationId: context.organizationId,
      storeId: context.storeId,
      customerName: transaction.customerName,
      customerMobile: transaction.customerMobile,
      grossAmount: transaction.billAmount,
      discountAmount: 0,
      pointsEarned: transaction.pointsEarned,
      pointsRedeemed: transaction.pointsRedeemed,
      redemptionValue: transaction.redeemedValue,
      clientTransactionId: transaction.id,
      businessDate: this.businessDateFromIso(transaction.date),
      medicines: (transaction.medicines ?? []).map((m) => ({
        medicineId: m.medicineId ?? null,
        name: m.name,
        manufacturer: m.manufacturer ?? null,
        packSize: m.packSize ?? null,
        mrp: m.mrp ?? null,
        quantity: m.quantity,
        unitPrice: m.price,
        lineTotal: Number((m.quantity * m.price).toFixed(2)),
        isPriceOverridden: !!m.isPriceOverridden,
        source: m.source ?? null,
      })),
    };

    try {
      await firstValueFrom(this.http.post(`${apiV1Base}/invoices`, payload));
      return { status: 'synced', message: 'Synced to backend invoice API' };
    } catch (error) {
      if (this.shouldTreatAsSynced(error)) {
        return { status: 'synced', message: 'Already synced earlier (duplicate transaction id)' };
      }

      return {
        status: 'failed',
        message: this.extractErrorMessage(error),
      };
    }
  }

  async sync(): Promise<void> {
    const cfg = this.config();
    if (!cfg.enabled || !cfg.apiUrl) return;

    const pending = this.transactionService.getPending();
    this.lastSyncAttempt.set(new Date().toISOString());
    if (pending.length === 0) return;

    this.isSyncing.set(true);

    try {
      const apiV1Base = this.resolveApiV1Base(cfg.apiUrl);
      const context = await firstValueFrom(
        this.http.get<{ organizationId: string; storeId: string }>(`${apiV1Base}/context/default`)
      );

      const syncedIds: string[] = [];
      const failedIds: string[] = [];

      for (const transaction of pending) {
        const result = await this.syncSingleTransaction(apiV1Base, context, transaction);

        this.pushActivityItem({
          transactionId: transaction.id,
          billNumber: transaction.billNumber,
          status: result.status,
          message: result.message,
        });

        if (result.status === 'synced') {
          syncedIds.push(transaction.id);
        } else {
          failedIds.push(transaction.id);
        }
      }

      if (syncedIds.length > 0) {
        this.transactionService.markSynced(syncedIds);
      }
      if (failedIds.length > 0) {
        this.transactionService.markFailed(failedIds);
      }

      this.lastSyncSuccess.set(failedIds.length === 0);
    } catch (error) {
      const ids = pending.map((t) => t.id);
      this.transactionService.markFailed(ids);
      this.lastSyncSuccess.set(false);

      this.pushActivityItem({
        transactionId: 'batch',
        billNumber: '-',
        status: 'failed',
        message: `Sync setup failed: ${this.extractErrorMessage(error)}`,
      });
    } finally {
      this.isSyncing.set(false);
    }
  }

  pendingCount(): number {
    return this.transactionService.getPending().length;
  }

  async syncTransactionById(transactionId: string): Promise<void> {
    const transaction = this.transactionService
      .getAll()()
      .find((item) => item.id === transactionId && item.syncStatus !== 'synced');

    if (!transaction) {
      return;
    }

    this.lastSyncAttempt.set(new Date().toISOString());

    const apiV1Base = this.getConfiguredApiBase();
    if (!apiV1Base) {
      this.transactionService.markFailed([transaction.id]);
      this.lastSyncSuccess.set(false);
      this.pushActivityItem({
        transactionId: transaction.id,
        billNumber: transaction.billNumber,
        status: 'failed',
        message: 'Manual sync failed: Configure Server API URL in Admin > Sync Settings',
      });
      return;
    }

    this.isSyncing.set(true);

    try {
      const context = await firstValueFrom(
        this.http.get<{ organizationId: string; storeId: string }>(`${apiV1Base}/context/default`)
      );
      const result = await this.syncSingleTransaction(apiV1Base, context, transaction);

      this.pushActivityItem({
        transactionId: transaction.id,
        billNumber: transaction.billNumber,
        status: result.status,
        message: result.message,
      });

      if (result.status === 'synced') {
        this.transactionService.markSynced([transaction.id]);
        this.lastSyncSuccess.set(true);
      } else {
        this.transactionService.markFailed([transaction.id]);
        this.lastSyncSuccess.set(false);
      }
    } catch (error) {
      this.transactionService.markFailed([transaction.id]);
      this.lastSyncSuccess.set(false);
      this.pushActivityItem({
        transactionId: transaction.id,
        billNumber: transaction.billNumber,
        status: 'failed',
        message: `Manual sync failed: ${this.extractErrorMessage(error)}`,
      });
    } finally {
      this.isSyncing.set(false);
    }
  }
}
