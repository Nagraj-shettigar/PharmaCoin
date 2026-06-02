import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../services/customer.service';
import { TransactionService } from '../../services/transaction.service';
import { RewardService } from '../../services/reward.service';
import { MedicineCatalogService } from '../../services/medicine-catalog.service';
import { Customer } from '../../models/customer.model';
import { MedicineItem } from '../../models/transaction.model';
import { DecimalPipe } from '@angular/common';
import { MedicineCatalogItem } from '../../models/medicine-catalog.model';

type BillingStep = 'lookup' | 'billing' | 'complete';
type BillMode = 'simple' | 'detailed';

@Component({
  selector: 'app-billing',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './billing.html',
  styleUrl: './billing.css',
})
export class Billing implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private customerService = inject(CustomerService);
  private transactionService = inject(TransactionService);
  private rewardService = inject(RewardService);
  private medicineCatalogService = inject(MedicineCatalogService);

  private medicineLookupTimer: ReturnType<typeof setTimeout> | null = null;

  // Step control
  step = signal<BillingStep>('lookup');

  // Lookup step
  mobileInput = signal('');
  lookupError = signal('');
  foundCustomer = signal<Customer | null>(null);
  isNewCustomer = signal(false);
  newCustomerName = signal('');

  // Billing step
  billMode = signal<BillMode>('simple');
  simpleBillAmount = signal<number | null>(null);
  medicines = signal<MedicineItem[]>([]);
  newMedicineName = signal('');
  newMedicineQty = signal<number>(1);
  newMedicineMrp = signal<number | null>(null);
  newMedicinePrice = signal<number | null>(null);
  selectedMedicine = signal<MedicineCatalogItem | null>(null);
  medicineSuggestions = signal<MedicineCatalogItem[]>([]);
  showMedicineSuggestions = signal(false);
  activeSuggestionIndex = signal(-1);
  medicineLookupLoading = signal(false);
  medicineLookupError = signal('');
  redeemEnabled = signal(false);
  pointsToRedeemInput = signal<number>(0);
  lastTransaction = signal<any>(null);

  // Computed values
  billAmount = computed(() => {
    if (this.billMode() === 'simple') {
      return this.simpleBillAmount() ?? 0;
    }
    return this.medicines().reduce((sum, m) => sum + m.quantity * m.price, 0);
  });

  earnedPoints = computed(() => this.rewardService.calculateEarnedPoints(this.billAmount()));

  maxRedeemable = computed(() => {
    const customer = this.foundCustomer();
    if (!customer) return { maxPoints: 0, maxValue: 0 };
    return this.rewardService.calculateMaxRedeemable(customer.pointsBalance, this.billAmount());
  });

  redeemValue = computed(() => {
    if (!this.redeemEnabled()) return 0;
    return this.rewardService.pointsToRupees(this.pointsToRedeemInput());
  });

  netAmount = computed(() => Math.max(0, this.billAmount() - this.redeemValue()));

  rewardConfig = computed(() => this.rewardService.getConfig()());

  canRedeem = computed(() => this.maxRedeemable().maxPoints > 0);

  isPriceOverridden = computed(() => {
    const selected = this.selectedMedicine();
    const mrp = this.newMedicineMrp();
    const price = this.newMedicinePrice();
    if (!selected || mrp == null || price == null) return false;
    return Math.abs(price - mrp) > 0.0001;
  });

  ngOnInit(): void {
    const mobile = this.route.snapshot.queryParamMap.get('mobile');
    if (mobile) {
      this.mobileInput.set(mobile);
      this.doLookup(mobile);
    }
  }

  ngOnDestroy(): void {
    this.clearMedicineLookupTimer();
  }

  onLookup(): void {
    const m = this.mobileInput().trim();
    if (!/^\d{10}$/.test(m)) {
      this.lookupError.set('Enter a valid 10-digit mobile number.');
      return;
    }
    this.lookupError.set('');
    this.doLookup(m);
  }

  private doLookup(mobile: string): void {
    const existing = this.customerService.findByMobile(mobile);
    if (existing) {
      this.foundCustomer.set(existing);
      this.isNewCustomer.set(false);
    } else {
      this.foundCustomer.set(null);
      this.isNewCustomer.set(true);
    }
  }

  onRegisterAndBill(): void {
    const name = this.newCustomerName().trim();
    if (!name) {
      this.lookupError.set('Customer name is required.');
      return;
    }
    const customer = this.customerService.create(name, this.mobileInput().trim());
    this.foundCustomer.set(customer);
    this.isNewCustomer.set(false);
    this.step.set('billing');
  }

  onProceedToBilling(): void {
    this.step.set('billing');
  }

  setBillMode(mode: BillMode): void {
    this.billMode.set(mode);
  }

  addMedicine(): void {
    const name = this.newMedicineName().trim();
    const qty = this.newMedicineQty();
    const price = this.newMedicinePrice();
    if (!name || !qty || price == null || price <= 0) return;

    const selected = this.selectedMedicine();
    const mrp = this.newMedicineMrp();

    this.medicines.update((list) => [
      ...list,
      {
        medicineId: selected?.id,
        name,
        manufacturer: selected?.manufacturer,
        packSize: selected?.packSize,
        mrp: mrp ?? undefined,
        quantity: Math.max(1, Math.floor(qty)),
        price,
        source: selected?.source ?? 'manual',
        isPriceOverridden: mrp != null ? Math.abs(price - mrp) > 0.0001 : false,
      },
    ]);

    this.newMedicineName.set('');
    this.newMedicineQty.set(1);
    this.newMedicineMrp.set(null);
    this.newMedicinePrice.set(null);
    this.selectedMedicine.set(null);
    this.medicineSuggestions.set([]);
    this.showMedicineSuggestions.set(false);
    this.activeSuggestionIndex.set(-1);
    this.medicineLookupError.set('');
  }

  onMedicineNameChange(value: string): void {
    this.newMedicineName.set(value);
    this.medicineLookupError.set('');

    if (!value.trim()) {
      this.selectedMedicine.set(null);
      this.newMedicineMrp.set(null);
      this.newMedicinePrice.set(null);
      this.medicineSuggestions.set([]);
      this.showMedicineSuggestions.set(false);
      this.activeSuggestionIndex.set(-1);
      this.clearMedicineLookupTimer();
      return;
    }

    if (this.selectedMedicine() && this.selectedMedicine()!.name !== value.trim()) {
      this.selectedMedicine.set(null);
      this.newMedicineMrp.set(null);
    }

    this.clearMedicineLookupTimer();
    this.medicineLookupTimer = setTimeout(() => {
      this.lookupMedicines(value);
    }, 250);
  }

  onMedicineInputFocus(): void {
    if (this.medicineSuggestions().length > 0) {
      this.showMedicineSuggestions.set(true);
      this.activeSuggestionIndex.set(0);
    }
  }

  onMedicineInputBlur(): void {
    setTimeout(() => {
      this.showMedicineSuggestions.set(false);
      this.activeSuggestionIndex.set(-1);
    }, 120);
  }

  onPriceChange(value: string | number): void {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(parsed)) {
      this.newMedicinePrice.set(null);
      return;
    }
    this.newMedicinePrice.set(parsed);
  }

  selectMedicineSuggestion(item: MedicineCatalogItem): void {
    this.selectedMedicine.set(item);
    this.newMedicineName.set(item.name);
    this.newMedicineMrp.set(item.mrp ?? null);
    this.newMedicinePrice.set(item.mrp ?? null);
    this.medicineSuggestions.set([]);
    this.showMedicineSuggestions.set(false);
    this.activeSuggestionIndex.set(-1);
    this.medicineLookupError.set(
      item.mrp == null
        ? 'MRP not available from source. Enter unit price manually.'
        : ''
    );
  }

  onSuggestionHover(index: number): void {
    this.activeSuggestionIndex.set(index);
  }

  onMedicineKeydown(event: KeyboardEvent): void {
    const suggestions = this.medicineSuggestions();
    if (suggestions.length === 0) return;

    const current = this.activeSuggestionIndex();

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.showMedicineSuggestions.set(true);
      const next = current < 0 ? 0 : Math.min(current + 1, suggestions.length - 1);
      this.activeSuggestionIndex.set(next);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.showMedicineSuggestions.set(true);
      const prev = current < 0 ? suggestions.length - 1 : Math.max(current - 1, 0);
      this.activeSuggestionIndex.set(prev);
      return;
    }

    if (event.key === 'Enter') {
      const index = current >= 0 ? current : 0;
      event.preventDefault();
      this.selectMedicineSuggestion(suggestions[index]);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.showMedicineSuggestions.set(false);
      this.activeSuggestionIndex.set(-1);
    }
  }

  private async lookupMedicines(term: string): Promise<void> {
    this.medicineLookupLoading.set(true);
    const results = await this.medicineCatalogService.searchMedicines(term);
    this.medicineLookupLoading.set(false);

    this.medicineSuggestions.set(results);
    this.showMedicineSuggestions.set(results.length > 0);
    this.activeSuggestionIndex.set(results.length > 0 ? 0 : -1);

    if (results.length === 0 && term.trim().length >= this.medicineCatalogService.getConfig()().minQueryLength) {
      this.medicineLookupError.set('No matches found. You can still add manually.');
    }
  }

  private clearMedicineLookupTimer(): void {
    if (this.medicineLookupTimer) {
      clearTimeout(this.medicineLookupTimer);
      this.medicineLookupTimer = null;
    }
  }

  removeMedicine(index: number): void {
    this.medicines.update((list) => list.filter((_, i) => i !== index));
  }

  onRedeemToggle(): void {
    if (!this.redeemEnabled()) {
      this.pointsToRedeemInput.set(0);
    } else {
      this.pointsToRedeemInput.set(this.maxRedeemable().maxPoints);
    }
  }

  clampRedeemPoints(): void {
    const max = this.maxRedeemable().maxPoints;
    const val = this.pointsToRedeemInput();
    if (val > max) this.pointsToRedeemInput.set(max);
    if (val < 0) this.pointsToRedeemInput.set(0);
  }

  canComplete(): boolean {
    return this.billAmount() > 0 && !!this.foundCustomer();
  }

  onCompleteTransaction(): void {
    const customer = this.foundCustomer();
    if (!customer || !this.canComplete()) return;

    const pointsRedeemed = this.redeemEnabled() ? this.pointsToRedeemInput() : 0;
    const redeemedValue = this.redeemEnabled() ? this.redeemValue() : 0;
    const pointsEarned = this.earnedPoints();
    const netPointsDelta = pointsEarned - pointsRedeemed;

    const transaction = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      customerId: customer.id,
      customerName: customer.name,
      customerMobile: customer.mobile,
      billAmount: this.billAmount(),
      medicines: this.billMode() === 'detailed' ? [...this.medicines()] : [],
      pointsEarned,
      pointsRedeemed,
      redeemedValue,
      netAmount: this.netAmount(),
      date: new Date().toISOString(),
      syncStatus: 'pending' as const,
    };

    this.transactionService.save(transaction);
    this.customerService.updatePoints(customer.id, netPointsDelta);

    const updatedCustomer = this.customerService.findById(customer.id)!;
    this.lastTransaction.set({ ...transaction, newBalance: updatedCustomer.pointsBalance });
    this.step.set('complete');
  }

  onNewBillSameCustomer(): void {
    const customer = this.foundCustomer();
    this.resetBillingForm();
    if (customer) {
      const refreshed = this.customerService.findById(customer.id);
      this.foundCustomer.set(refreshed ?? null);
      this.step.set('billing');
    }
  }

  onNewBill(): void {
    this.router.navigate(['/billing']);
    this.resetAll();
  }

  onViewCustomer(): void {
    const customer = this.foundCustomer();
    if (customer) this.router.navigate(['/customer', customer.id]);
  }

  private resetBillingForm(): void {
    this.billMode.set('simple');
    this.simpleBillAmount.set(null);
    this.medicines.set([]);
    this.newMedicineName.set('');
    this.newMedicineQty.set(1);
    this.newMedicineMrp.set(null);
    this.newMedicinePrice.set(null);
    this.selectedMedicine.set(null);
    this.medicineSuggestions.set([]);
    this.showMedicineSuggestions.set(false);
    this.activeSuggestionIndex.set(-1);
    this.medicineLookupLoading.set(false);
    this.medicineLookupError.set('');
    this.redeemEnabled.set(false);
    this.pointsToRedeemInput.set(0);
    this.lastTransaction.set(null);
  }

  private resetAll(): void {
    this.resetBillingForm();
    this.step.set('lookup');
    this.mobileInput.set('');
    this.lookupError.set('');
    this.foundCustomer.set(null);
    this.isNewCustomer.set(false);
    this.newCustomerName.set('');
  }
}
