import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../services/customer.service';
import { TransactionService } from '../../services/transaction.service';
import { RewardService } from '../../services/reward.service';
import { Customer } from '../../models/customer.model';
import { MedicineItem, Transaction } from '../../models/transaction.model';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-customer-detail',
  imports: [RouterLink, DecimalPipe, FormsModule],
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

  // Profile editing (#2)
  editing = signal(false);
  editName = signal('');
  editMobile = signal('');
  profileError = signal('');
  pendingPhoneChange = signal(false);

  // Accordions (#6, #8, #18)
  billsOpen = signal(true);
  medsOpen = signal(false);
  expandedBillId = signal<string | null>(null);

  distinctMedicines = computed<MedicineItem[]>(() => {
    const map = new Map<string, MedicineItem>();
    for (const tx of this.transactions()) {
      for (const med of tx.medicines ?? []) {
        const key = (med.medicineId ?? med.name).trim().toLowerCase();
        if (!key) continue;
        if (!map.has(key)) map.set(key, med);
      }
    }
    return Array.from(map.values());
  });

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

  formatShortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
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

  // ---- Profile editing (#2) ----
  startEdit(): void {
    const c = this.customer();
    if (!c) return;
    this.editName.set(c.name);
    this.editMobile.set(c.mobile);
    this.profileError.set('');
    this.pendingPhoneChange.set(false);
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.pendingPhoneChange.set(false);
    this.profileError.set('');
  }

  saveProfile(): void {
    const c = this.customer();
    if (!c) return;

    const name = this.editName().trim();
    const mobile = this.editMobile().trim();

    if (!name) {
      this.profileError.set('Name cannot be empty.');
      return;
    }

    // Phone is the identity key — confirm before changing it.
    if (mobile !== c.mobile && !this.pendingPhoneChange()) {
      this.pendingPhoneChange.set(true);
      return;
    }

    this.applyProfile(name, mobile);
  }

  confirmPhoneChange(): void {
    this.applyProfile(this.editName().trim(), this.editMobile().trim());
  }

  cancelPhoneChange(): void {
    this.pendingPhoneChange.set(false);
  }

  private applyProfile(name: string, mobile: string): void {
    const c = this.customer();
    if (!c) return;

    try {
      const updated = this.customerService.updateProfile(c.id, { name, mobile });
      this.customer.set(updated);
      this.editing.set(false);
      this.pendingPhoneChange.set(false);
      this.profileError.set('');
    } catch (error) {
      this.profileError.set(error instanceof Error ? error.message : 'Could not update profile.');
      this.pendingPhoneChange.set(false);
    }
  }

  // ---- Accordions ----
  toggleBills(): void {
    this.billsOpen.update((v) => !v);
  }

  toggleMeds(): void {
    this.medsOpen.update((v) => !v);
  }

  toggleBillExpanded(billId: string): void {
    this.expandedBillId.update((current) => (current === billId ? null : billId));
  }
}
