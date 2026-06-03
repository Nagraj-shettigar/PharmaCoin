import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { CustomerService } from '../../services/customer.service';
import { SyncService } from '../../services/sync.service';
import { Transaction } from '../../models/transaction.model';
import { BillReceipt } from '../../components/bill-receipt/bill-receipt';
import {
  StatsRangeFilter,
  StatsRangePreset,
  TransactionService,
} from '../../services/transaction.service';

interface DashboardRangeOption {
  value: StatsRangePreset;
  label: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [FormsModule, DecimalPipe, BillReceipt],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private router = inject(Router);
  private customerService = inject(CustomerService);
  private transactionService = inject(TransactionService);
  private syncService = inject(SyncService);

  mobile = signal('');
  searchError = signal('');
  syncError = signal('');
  selectedRange = signal<StatsRangePreset>('lifetime');
  customStartDate = signal('');
  customEndDate = signal('');
  syncingTransactionIds = signal<string[]>([]);
  printTransaction = signal<Transaction | null>(null);

  readonly rangeOptions: DashboardRangeOption[] = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'year', label: 'This Year' },
    { value: 'lifetime', label: 'Lifetime' },
    { value: 'custom', label: 'Custom Dates' },
  ];

  readonly rangeState = computed(() => {
    const preset = this.selectedRange();

    if (preset !== 'custom') {
      return {
        valid: true,
        message: '',
        label: this.rangeOptions.find((option) => option.value === preset)?.label ?? 'Lifetime',
        filter: { preset } as StatsRangeFilter,
      };
    }

    const startDate = this.customStartDate();
    const endDate = this.customEndDate();

    if (!startDate || !endDate) {
      return {
        valid: false,
        message: 'Select both start and end dates to review a custom window.',
        label: 'Custom Date Range',
        filter: null,
      };
    }

    if (startDate > endDate) {
      return {
        valid: false,
        message: 'Start date must be earlier than or equal to the end date.',
        label: 'Custom Date Range',
        filter: null,
      };
    }

    return {
      valid: true,
      message: '',
      label: `${this.formatShortDate(startDate)} to ${this.formatShortDate(endDate)}`,
      filter: { preset: 'custom', startDate, endDate } as StatsRangeFilter,
    };
  });

  readonly stats = computed(() => {
    const rangeState = this.rangeState();
    if (!rangeState.filter) {
      return {
        totalTransactions: 0,
        totalBilling: 0,
        totalPointsIssued: 0,
        totalPointsRedeemed: 0,
      };
    }

    return this.transactionService.getStats(rangeState.filter);
  });

  readonly recentTransactions = computed(() => {
    const filter = this.rangeState().filter;
    if (!filter) {
      return [];
    }

    return this.transactionService
      .getFiltered(filter)
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  });

  get totalCustomers(): number {
    return this.customerService.getAll()().length;
  }

  onSearch(): void {
    const m = this.mobile().trim();
    if (!m) {
      this.searchError.set('Please enter a mobile number.');
      return;
    }
    if (!/^\d{10}$/.test(m)) {
      this.searchError.set('Enter a valid 10-digit mobile number.');
      return;
    }
    this.searchError.set('');

    // Customer-first flow: known customers open their home; new numbers go
    // straight to billing/registration (which also performs a backend lookup).
    const existing = this.customerService.findByMobile(m);
    if (existing) {
      this.router.navigate(['/customer', existing.id]);
    } else {
      this.router.navigate(['/billing'], { queryParams: { mobile: m } });
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.onSearch();
  }

  setRange(preset: StatsRangePreset): void {
    this.selectedRange.set(preset);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatShortDate(value: string): string {
    const [yearText, monthText, dayText] = value.split('-');
    return new Date(Number(yearText), Number(monthText) - 1, Number(dayText)).toLocaleDateString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }
    );
  }

  navigateToCustomer(customerId: string): void {
    this.router.navigate(['/customer', customerId]);
  }

  isManualSyncing(transactionId: string): boolean {
    return this.syncingTransactionIds().includes(transactionId);
  }

  printBill(tx: Transaction, event: Event): void {
    event.stopPropagation();
    this.printTransaction.set(tx);
    // Let Angular render the hidden print-area, then open the print dialog.
    setTimeout(() => window.print());
  }

  @HostListener('window:afterprint')
  onAfterPrint(): void {
    this.printTransaction.set(null);
  }

  async manualSync(tx: Transaction, event: Event): Promise<void> {
    event.stopPropagation();

    if (tx.syncStatus === 'synced' || this.isManualSyncing(tx.id)) {
      return;
    }

    this.syncError.set('');
    this.syncingTransactionIds.update((ids) => [...ids, tx.id]);

    try {
      await this.syncService.syncTransactionById(tx.id);
    } catch {
      this.syncError.set('Manual sync failed. Please verify sync settings and backend connection.');
    } finally {
      this.syncingTransactionIds.update((ids) => ids.filter((id) => id !== tx.id));
    }
  }
}
