import { Component, Input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Transaction } from '../../models/transaction.model';

/** Shop identity printed on the bill. Centralised for a single edit point. */
export const SHOP_NAME = 'HealthPoints Pharmacy';

@Component({
  selector: 'app-bill-receipt',
  imports: [DecimalPipe],
  templateUrl: './bill-receipt.html',
  styleUrl: './bill-receipt.css',
})
export class BillReceipt {
  /** The completed transaction to render as a bill. */
  @Input({ required: true }) transaction!: Transaction;
  /** Resulting points balance to show on the bill, when known. */
  @Input() newBalance: number | null = null;

  readonly shopName = SHOP_NAME;

  get discount(): number {
    return this.transaction.billAmount - this.transaction.netAmount;
  }

  formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
