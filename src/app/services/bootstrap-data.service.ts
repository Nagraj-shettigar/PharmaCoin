import { Injectable, inject, signal } from '@angular/core';
import { BillingApiService } from './billing-api.service';
import { CustomerService } from './customer.service';
import { TransactionService } from './transaction.service';

export type BootstrapStatus = 'loading' | 'live' | 'offline';

@Injectable({ providedIn: 'root' })
export class BootstrapDataService {
  private billingApiService = inject(BillingApiService);
  private customerService = inject(CustomerService);
  private transactionService = inject(TransactionService);

  status = signal<BootstrapStatus>('loading');
  lastHydratedAt = signal<string | null>(null);

  async hydrateFromBackend(): Promise<void> {
    this.status.set('loading');

    try {
      const [customers, transactions] = await Promise.all([
        this.billingApiService.listCustomers(),
        this.billingApiService.listTransactions(),
      ]);

      this.customerService.hydrateFromBackend(customers);
      this.transactionService.hydrateSyncedFromBackend(transactions);
      this.status.set('live');
      this.lastHydratedAt.set(new Date().toISOString());
    } catch {
      // Keep offline-first behavior if backend is unavailable.
      this.status.set('offline');
    }
  }
}
