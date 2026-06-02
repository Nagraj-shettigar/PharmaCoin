import { Injectable, inject, signal } from '@angular/core';
import { Transaction } from '../models/transaction.model';
import { StorageService } from './storage.service';

const STORAGE_KEY = 'hp_transactions';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private storage = inject(StorageService);
  private transactions = signal<Transaction[]>([]);

  constructor() {
    const saved = this.storage.get<Transaction[]>(STORAGE_KEY);
    if (saved) this.transactions.set(saved);
  }

  getAll() {
    return this.transactions;
  }

  getByCustomer(customerId: string): Transaction[] {
    return this.transactions()
      .filter((t) => t.customerId === customerId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  getPending(): Transaction[] {
    return this.transactions().filter((t) => t.syncStatus === 'pending');
  }

  save(transaction: Transaction): void {
    const updated = [transaction, ...this.transactions()];
    this.transactions.set(updated);
    this.persist();
  }

  markSynced(ids: string[]): void {
    const updated = this.transactions().map((t) =>
      ids.includes(t.id) ? { ...t, syncStatus: 'synced' as const } : t
    );
    this.transactions.set(updated);
    this.persist();
  }

  markFailed(ids: string[]): void {
    const updated = this.transactions().map((t) =>
      ids.includes(t.id) ? { ...t, syncStatus: 'failed' as const } : t
    );
    this.transactions.set(updated);
    this.persist();
  }

  getStats() {
    const all = this.transactions();
    const totalBilling = all.reduce((sum, t) => sum + t.billAmount, 0);
    const totalPointsIssued = all.reduce((sum, t) => sum + t.pointsEarned, 0);
    const totalPointsRedeemed = all.reduce((sum, t) => sum + t.pointsRedeemed, 0);
    return { totalTransactions: all.length, totalBilling, totalPointsIssued, totalPointsRedeemed };
  }

  private persist(): void {
    this.storage.set(STORAGE_KEY, this.transactions());
  }
}
