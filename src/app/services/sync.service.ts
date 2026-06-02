import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TransactionService } from './transaction.service';
import { StorageService } from './storage.service';
import { SyncConfig, DEFAULT_SYNC_CONFIG } from '../models/sync-config.model';

const CONFIG_KEY = 'hp_sync_config';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private transactionService = inject(TransactionService);
  private storage = inject(StorageService);
  private http = inject(HttpClient);

  config = signal<SyncConfig>(DEFAULT_SYNC_CONFIG);
  lastSyncAttempt = signal<string | null>(null);
  lastSyncSuccess = signal<boolean>(false);
  isSyncing = signal<boolean>(false);

  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const saved = this.storage.get<SyncConfig>(CONFIG_KEY);
    if (saved) this.config.set(saved);
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

  async sync(): Promise<void> {
    const cfg = this.config();
    if (!cfg.enabled || !cfg.apiUrl) return;

    const pending = this.transactionService.getPending();
    this.lastSyncAttempt.set(new Date().toISOString());
    if (pending.length === 0) return;

    this.isSyncing.set(true);
    const ids = pending.map((t) => t.id);

    this.http.post(`${cfg.apiUrl}/transactions/batch`, { transactions: pending }).subscribe({
      next: () => {
        this.transactionService.markSynced(ids);
        this.lastSyncSuccess.set(true);
        this.isSyncing.set(false);
      },
      error: () => {
        this.transactionService.markFailed(ids);
        this.lastSyncSuccess.set(false);
        this.isSyncing.set(false);
      },
    });
  }

  pendingCount(): number {
    return this.transactionService.getPending().length;
  }
}
