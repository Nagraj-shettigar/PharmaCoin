import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CustomerService } from '../../services/customer.service';
import { TransactionService } from '../../services/transaction.service';
import { RewardService } from '../../services/reward.service';
import { Customer } from '../../models/customer.model';
import { Transaction } from '../../models/transaction.model';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-customer-detail',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './customer-detail.html',
  styleUrl: './customer-detail.css',
})
export class CustomerDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private customerService = inject(CustomerService);
  private transactionService = inject(TransactionService);
  private rewardService = inject(RewardService);

  customer = signal<Customer | null>(null);
  transactions = signal<Transaction[]>([]);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/']);
      return;
    }
    const customer = this.customerService.findById(id);
    if (!customer) {
      this.router.navigate(['/']);
      return;
    }
    this.customer.set(customer);
    this.transactions.set(this.transactionService.getByCustomer(id));
  }

  get pointsValue(): number {
    const c = this.customer();
    if (!c) return 0;
    return this.rewardService.pointsToRupees(c.pointsBalance);
  }

  get totalSpent(): number {
    return this.transactions().reduce((sum, t) => sum + t.billAmount, 0);
  }

  get totalPointsEarned(): number {
    return this.transactions().reduce((sum, t) => sum + t.pointsEarned, 0);
  }

  get totalPointsRedeemed(): number {
    return this.transactions().reduce((sum, t) => sum + t.pointsRedeemed, 0);
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

  memberSince(): string {
    const c = this.customer();
    if (!c) return '';
    return new Date(c.createdAt).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  startNewBill(): void {
    const c = this.customer();
    if (c) this.router.navigate(['/billing'], { queryParams: { mobile: c.mobile } });
  }
}
