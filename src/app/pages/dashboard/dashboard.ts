import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { CustomerService } from '../../services/customer.service';
import { TransactionService } from '../../services/transaction.service';

@Component({
  selector: 'app-dashboard',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private router = inject(Router);
  private customerService = inject(CustomerService);
  private transactionService = inject(TransactionService);

  mobile = signal('');
  searchError = signal('');

  get totalCustomers(): number {
    return this.customerService.getAll()().length;
  }

  get stats() {
    return this.transactionService.getStats();
  }

  get recentTransactions() {
    return this.transactionService
      .getAll()()
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
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
    this.router.navigate(['/billing'], { queryParams: { mobile: m } });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.onSearch();
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

  navigateToCustomer(customerId: string): void {
    this.router.navigate(['/customer', customerId]);
  }
}
