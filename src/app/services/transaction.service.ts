import { Injectable, inject, signal } from '@angular/core';
import { Transaction } from '../models/transaction.model';
import { StorageService } from './storage.service';

const STORAGE_KEY = 'hp_transactions';

export type StatsRangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'lifetime' | 'custom';

export interface StatsRangeFilter {
  preset: StatsRangePreset;
  startDate?: string;
  endDate?: string;
}

export interface TransactionStats {
  totalTransactions: number;
  totalBilling: number;
  totalPointsIssued: number;
  totalPointsRedeemed: number;
}

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private storage = inject(StorageService);
  private transactions = signal<Transaction[]>([]);

  constructor() {
    const saved = this.storage.get<Transaction[]>(STORAGE_KEY);
    if (saved) {
      const normalized = this.normalizeTransactions(saved);
      this.transactions.set(normalized);
      if (normalized.some((transaction, index) => transaction !== saved[index])) {
        this.persist();
      }
    }
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
    return this.transactions().filter((t) => t.syncStatus === 'pending' || t.syncStatus === 'failed');
  }

  getFiltered(filter: StatsRangeFilter): Transaction[] {
    const range = this.resolveRange(filter);
    if (!range) {
      return this.transactions();
    }

    return this.transactions().filter((transaction) => {
      const transactionTime = new Date(transaction.date).getTime();
      return transactionTime >= range.start.getTime() && transactionTime <= range.end.getTime();
    });
  }

  generateBillNumber(dateIso: string = new Date().toISOString()): string {
    const date = new Date(dateIso);
    const datePart = [date.getFullYear(), this.pad(date.getMonth() + 1), this.pad(date.getDate())].join('');
    const prefix = `HP-${datePart}`;

    let sequence = 1;
    let candidate = `${prefix}-${this.pad(sequence, 4)}`;
    const existingBillNumbers = new Set(this.transactions().map((transaction) => transaction.billNumber));

    while (existingBillNumbers.has(candidate)) {
      sequence += 1;
      candidate = `${prefix}-${this.pad(sequence, 4)}`;
    }

    return candidate;
  }

  save(transaction: Transaction): void {
    if (this.transactions().some((existing) => existing.id === transaction.id)) {
      throw new Error(`Duplicate transaction id: ${transaction.id}`);
    }

    if (this.transactions().some((existing) => existing.billNumber === transaction.billNumber)) {
      throw new Error(`Duplicate bill number: ${transaction.billNumber}`);
    }

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

  hydrateSyncedFromBackend(transactions: Transaction[]): void {
    const normalizedBackend = this.normalizeTransactions(
      transactions.map((transaction) => ({
        ...transaction,
        medicines: transaction.medicines ?? [],
        syncStatus: 'synced' as const,
      }))
    );

    const localUnsynced = this.transactions().filter((transaction) => transaction.syncStatus !== 'synced');
    const usedKeys = new Set(normalizedBackend.map((transaction) => `${transaction.id}|${transaction.billNumber}`));

    for (const transaction of localUnsynced) {
      const key = `${transaction.id}|${transaction.billNumber}`;
      if (!usedKeys.has(key)) {
        normalizedBackend.push(transaction);
        usedKeys.add(key);
      }
    }

    normalizedBackend.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    this.transactions.set(normalizedBackend);
    this.persist();
  }

  getStats(filter: StatsRangeFilter = { preset: 'lifetime' }): TransactionStats {
    const all = this.getFiltered(filter);
    const totalBilling = all.reduce((sum, t) => sum + t.billAmount, 0);
    const totalPointsIssued = all.reduce((sum, t) => sum + t.pointsEarned, 0);
    const totalPointsRedeemed = all.reduce((sum, t) => sum + t.pointsRedeemed, 0);
    return { totalTransactions: all.length, totalBilling, totalPointsIssued, totalPointsRedeemed };
  }

  private resolveRange(filter: StatsRangeFilter): { start: Date; end: Date } | null {
    const now = new Date();

    switch (filter.preset) {
      case 'lifetime':
        return null;
      case 'today': {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      case 'yesterday': {
        const start = new Date(now);
        start.setDate(now.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setDate(now.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      case 'week': {
        const currentDay = now.getDay();
        const daysSinceMonday = currentDay === 0 ? 6 : currentDay - 1;
        const start = new Date(now);
        start.setDate(now.getDate() - daysSinceMonday);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      case 'month': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      case 'year': {
        const start = new Date(now.getFullYear(), 0, 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      case 'custom': {
        const start = this.parseDateInput(filter.startDate, 'start');
        const end = this.parseDateInput(filter.endDate, 'end');
        if (!start || !end) {
          return null;
        }
        return { start, end };
      }
    }
  }

  private parseDateInput(value: string | undefined, edge: 'start' | 'end'): Date | null {
    if (!value) {
      return null;
    }

    const [yearText, monthText, dayText] = value.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);

    if ([year, month, day].some((part) => Number.isNaN(part))) {
      return null;
    }

    const parsed = new Date(year, month - 1, day);
    if (edge === 'start') {
      parsed.setHours(0, 0, 0, 0);
    } else {
      parsed.setHours(23, 59, 59, 999);
    }
    return parsed;
  }

  private normalizeTransactions(transactions: Transaction[]): Transaction[] {
    const usedBillNumbers = new Set<string>();

    return transactions.map((transaction) => {
      let billNumber = transaction.billNumber;

      if (!billNumber || usedBillNumbers.has(billNumber)) {
        billNumber = this.generateMissingBillNumber(transaction.date, usedBillNumbers);
      }

      usedBillNumbers.add(billNumber);
      return billNumber === transaction.billNumber ? transaction : { ...transaction, billNumber };
    });
  }

  private generateMissingBillNumber(dateIso: string, usedBillNumbers: Set<string>): string {
    const date = new Date(dateIso);
    const datePart = [date.getFullYear(), this.pad(date.getMonth() + 1), this.pad(date.getDate())].join('');
    const prefix = `HP-${datePart}`;

    let sequence = 1;
    let candidate = `${prefix}-${this.pad(sequence, 4)}`;
    while (usedBillNumbers.has(candidate)) {
      sequence += 1;
      candidate = `${prefix}-${this.pad(sequence, 4)}`;
    }

    return candidate;
  }

  private pad(value: number, width = 2): string {
    return value.toString().padStart(width, '0');
  }

  private persist(): void {
    this.storage.set(STORAGE_KEY, this.transactions());
  }
}
