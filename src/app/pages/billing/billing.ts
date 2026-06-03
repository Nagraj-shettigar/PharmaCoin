import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../services/customer.service';
import { TransactionService } from '../../services/transaction.service';
import { RewardService } from '../../services/reward.service';
import { MedicineCatalogService } from '../../services/medicine-catalog.service';
import { BillingApiService } from '../../services/billing-api.service';
import { StaffService } from '../../services/staff.service';
import { Customer } from '../../models/customer.model';
import { MedicineItem, Transaction } from '../../models/transaction.model';
import { DecimalPipe } from '@angular/common';
import { MedicineCatalogItem } from '../../models/medicine-catalog.model';
import { BillReceipt } from '../../components/bill-receipt/bill-receipt';

type BillingStep = 'lookup' | 'billing' | 'complete';
type RewardDecision = 'pending' | 'accepted' | 'customized';

interface ChoiceAction {
  label: string;
  value: string;
  variant: 'primary' | 'secondary' | 'ghost';
}

interface ChoicePrompt {
  title: string;
  message: string;
  actions: ChoiceAction[];
}

@Component({
  selector: 'app-billing',
  imports: [FormsModule, DecimalPipe, BillReceipt, RouterLink],
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
  private billingApiService = inject(BillingApiService);
  staffService = inject(StaffService);

  private medicineLookupTimer: ReturnType<typeof setTimeout> | null = null;

  // Step control
  step = signal<BillingStep>('lookup');

  // Lookup step
  mobileInput = signal('');
  lookupError = signal('');
  foundCustomer = signal<Customer | null>(null);
  isNewCustomer = signal(false);
  newCustomerName = signal('');

  // Billing step (detailed-only)
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

  // Quick "misc amount" entry (no named medicine)
  quickMiscAmount = signal<number | null>(null);

  // Billed-by attribution
  billedByInput = signal('');

  redeemEnabled = signal(false);
  pointsToRedeemInput = signal<number>(0);
  lastTransaction = signal<Transaction | null>(null);
  lastBalance = signal<number | null>(null);
  rewardDecision = signal<RewardDecision>('pending');
  approvedEarnedPoints = signal(0);
  customEarnedPointsInput = signal<number | null>(null);
  showCustomPoints = signal(false);
  isSubmitting = signal(false);
  submitError = signal('');

  // Generic choice modal (replaces window.confirm)
  choicePrompt = signal<ChoicePrompt | null>(null);
  private choiceResolver: ((value: string | null) => void) | null = null;

  // Purchase history accordions
  showHistoryBills = signal(false);
  showHistoryMedicines = signal(false);
  expandedBillId = signal<string | null>(null);

  customerBills = computed<Transaction[]>(() => {
    const customer = this.foundCustomer();
    if (!customer) return [];
    return this.transactionService.getByCustomer(customer.id);
  });

  customerDistinctMedicines = computed<MedicineItem[]>(() => {
    const bills = this.customerBills();
    const map = new Map<string, MedicineItem>();
    for (const tx of bills) {
      for (const med of tx.medicines ?? []) {
        const key = (med.medicineId ?? med.name).trim().toLowerCase();
        if (!key) continue;
        if (!map.has(key)) {
          map.set(key, med);
        }
      }
    }
    return Array.from(map.values());
  });

  hasPurchaseHistory = computed(() => this.customerBills().length > 0);

  private rewardDecisionBaseline = '';

  // Computed values
  billAmount = computed(() => this.medicines().reduce((sum, m) => sum + m.quantity * m.price, 0));

  suggestedEarnedPoints = computed(() =>
    this.rewardService.calculateEarnedPoints(this.billAmount())
  );

  /** Custom points may never exceed the bill total (#12). */
  customPointsCap = computed(() => Math.floor(this.billAmount()));

  /** Warn when custom points are 10% or more of the bill total (#13). */
  customPointsWarning = computed(() => {
    const entered = this.customEarnedPointsInput();
    const bill = this.billAmount();
    if (entered == null || entered <= 0 || bill <= 0) return false;
    return entered >= bill * 0.1;
  });

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

  rewardDecisionResolved = computed(() => this.rewardDecision() !== 'pending');

  staffList = computed(() => this.staffService.getStaff()());

  constructor() {
    effect(
      () => {
        const config = this.rewardConfig();
        const billAmount = this.billAmount();
        const suggestedPoints = this.suggestedEarnedPoints();
        const baseline = [
          billAmount,
          suggestedPoints,
          config.pointsPerHundredRupees,
          config.minBillAmountToEarn,
        ].join('|');

        if (this.rewardDecisionBaseline !== baseline) {
          // A material change requires re-confirmation, but preserve a custom
          // entry so the cashier only re-approves rather than re-typing.
          const previousCustom = this.customEarnedPointsInput();
          const preserveCustom = this.rewardDecision() === 'customized' && previousCustom != null;

          this.rewardDecisionBaseline = baseline;
          this.rewardDecision.set('pending');
          this.approvedEarnedPoints.set(suggestedPoints);
          this.customEarnedPointsInput.set(preserveCustom ? previousCustom : suggestedPoints);
        }
      },
      { allowSignalWrites: true }
    );
  }

  ngOnInit(): void {
    this.billedByInput.set(this.staffService.activeStaff());
    const mobile = this.route.snapshot.queryParamMap.get('mobile');
    if (mobile) {
      this.mobileInput.set(mobile);
      void this.doLookup(mobile);
    }
  }

  ngOnDestroy(): void {
    this.clearMedicineLookupTimer();
  }

  // ---- Choice modal helpers (replaces window.confirm, #15a) ----
  private askChoice(prompt: ChoicePrompt): Promise<string | null> {
    return new Promise((resolve) => {
      this.choiceResolver = resolve;
      this.choicePrompt.set(prompt);
    });
  }

  resolveChoice(value: string | null): void {
    this.choicePrompt.set(null);
    const resolver = this.choiceResolver;
    this.choiceResolver = null;
    resolver?.(value);
  }

  onLookup(): void {
    const m = this.mobileInput().trim();
    if (!/^\d{10}$/.test(m)) {
      this.lookupError.set('Enter a valid 10-digit mobile number.');
      return;
    }
    this.lookupError.set('');
    void this.doLookup(m);
  }

  private async doLookup(mobile: string): Promise<void> {
    const existingLocal = this.customerService.findByMobile(mobile);

    try {
      const response = await this.billingApiService.lookupCustomer(mobile);
      if (response.found && response.customer) {
        const hydrated = this.customerService.upsertFromBackend(response.customer);
        this.foundCustomer.set(hydrated);
        this.isNewCustomer.set(false);
        return;
      }

      if (existingLocal) {
        this.foundCustomer.set(existingLocal);
        this.isNewCustomer.set(false);
        return;
      }

      this.foundCustomer.set(null);
      this.isNewCustomer.set(true);
    } catch {
      if (existingLocal) {
        this.foundCustomer.set(existingLocal);
        this.isNewCustomer.set(false);
        this.lookupError.set('Backend unavailable. Using offline customer data.');
        return;
      }

      this.foundCustomer.set(null);
      this.isNewCustomer.set(true);
      this.lookupError.set('Backend unavailable. Registering customer offline.');
    }
  }

  async onRegisterAndBill(): Promise<void> {
    const name = this.newCustomerName().trim();
    if (!name) {
      this.lookupError.set('Customer name is required.');
      return;
    }

    this.lookupError.set('');

    try {
      const context = await this.billingApiService.getDefaultContext();
      const response = await this.billingApiService.upsertCustomer({
        organizationId: context.organizationId,
        storeId: context.storeId,
        name,
        mobile: this.mobileInput().trim(),
      });

      const customer = this.customerService.upsertFromBackend(response.customer);
      this.foundCustomer.set(customer);
      this.isNewCustomer.set(false);
      this.step.set('billing');
      return;
    } catch {
      const customer = this.customerService.create(name, this.mobileInput().trim());
      this.foundCustomer.set(customer);
      this.isNewCustomer.set(false);
      this.step.set('billing');
      this.lookupError.set('Backend unavailable. Customer was created locally and will continue offline.');
    }
  }

  onProceedToBilling(): void {
    this.step.set('billing');
  }

  changeCustomer(): void {
    this.step.set('lookup');
  }

  viewCustomerHistory(): void {
    const customer = this.foundCustomer();
    if (customer) {
      this.router.navigate(['/customer', customer.id]);
    }
  }

  existingCustomerBillCount(): number {
    const customer = this.foundCustomer();
    if (!customer) {
      return 0;
    }

    return this.transactionService.getByCustomer(customer.id).length;
  }

  latestCustomerTransaction(): Transaction | null {
    const customer = this.foundCustomer();
    if (!customer) {
      return null;
    }

    return this.transactionService.getByCustomer(customer.id)[0] ?? null;
  }

  formatShortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private buildClientTransactionId(): string {
    return `txn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private resolveBusinessDate(dateIso: string): string {
    return dateIso.slice(0, 10);
  }

  private toApiMedicines(medicines: MedicineItem[]): Array<{
    medicineId: string | null;
    name: string;
    manufacturer: string | null;
    packSize: string | null;
    mrp: number | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    isPriceOverridden: boolean;
    source: 'local' | 'remote' | 'manual' | null;
  }> {
    return (medicines ?? []).map((m) => ({
      medicineId: m.medicineId ?? null,
      name: m.name,
      manufacturer: m.manufacturer ?? null,
      packSize: m.packSize ?? null,
      mrp: m.mrp ?? null,
      quantity: m.quantity,
      unitPrice: m.price,
      lineTotal: Number((m.quantity * m.price).toFixed(2)),
      isPriceOverridden: !!m.isPriceOverridden,
      source: m.source ?? null,
    }));
  }

  private effectiveBilledBy(): string | undefined {
    const value = (
      this.staffList().length > 0 ? this.staffService.activeStaff() : this.billedByInput()
    ).trim();
    return value || undefined;
  }

  async onCompleteTransaction(): Promise<void> {
    const customer = this.foundCustomer();
    if (!customer || !this.canComplete() || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.submitError.set('');

    const pointsRedeemed = this.redeemEnabled() ? this.pointsToRedeemInput() : 0;
    const redeemedValue = this.redeemEnabled() ? this.redeemValue() : 0;
    const pointsEarned = this.approvedEarnedPoints();
    const netPointsDelta = pointsEarned - pointsRedeemed;
    const transactionDate = new Date().toISOString();
    const billedBy = this.effectiveBilledBy();

    const transactionBase = {
      id: this.buildClientTransactionId(),
      customerId: customer.id,
      customerName: customer.name,
      customerMobile: customer.mobile,
      billAmount: this.billAmount(),
      medicines: [...this.medicines()],
      pointsEarned,
      pointsRedeemed,
      redeemedValue,
      netAmount: this.netAmount(),
      date: transactionDate,
      billedBy,
    };

    let transaction: Transaction = {
      ...transactionBase,
      billNumber: this.transactionService.generateBillNumber(transactionDate),
      syncStatus: 'pending' as const,
    };
    let latestBalance = Math.max(0, customer.pointsBalance + netPointsDelta);

    // Apply points only after the local save succeeds (see #3 fix).
    let applyPoints: () => void;

    try {
      const context = await this.billingApiService.getDefaultContext();
      const invoice = await this.billingApiService.createInvoice({
        organizationId: context.organizationId,
        storeId: context.storeId,
        customerName: customer.name,
        customerMobile: customer.mobile,
        grossAmount: this.billAmount(),
        discountAmount: 0,
        pointsEarned,
        pointsRedeemed,
        redemptionValue: redeemedValue,
        clientTransactionId: transactionBase.id,
        businessDate: this.resolveBusinessDate(transactionDate),
        medicines: this.toApiMedicines(transactionBase.medicines),
      });

      transaction = {
        ...transactionBase,
        billNumber: invoice.billNumber,
        syncStatus: 'synced' as const,
      };

      latestBalance = invoice.pointsBalance;
      applyPoints = () => this.customerService.setPointsBalance(customer.id, latestBalance);
    } catch {
      applyPoints = () => this.customerService.updatePoints(customer.id, netPointsDelta);
      this.submitError.set('Saved offline. Sync status is pending until backend is reachable.');
    }

    try {
      this.transactionService.save(transaction);
    } catch (error) {
      this.submitError.set(error instanceof Error ? error.message : 'Could not save transaction locally.');
      this.isSubmitting.set(false);
      return;
    }

    applyPoints();

    const updatedCustomer = this.customerService.findById(customer.id);
    this.lastTransaction.set(transaction);
    this.lastBalance.set(updatedCustomer?.pointsBalance ?? latestBalance);
    this.step.set('complete');
    this.isSubmitting.set(false);
  }

  printBill(): void {
    window.print();
  }

  // ---- Medicine entry ----
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

    this.resetAddMedicineRow();
  }

  /** Quick add of a non-itemised amount (e.g. consultation / sundry) — #21. */
  addQuickMisc(): void {
    const amount = this.quickMiscAmount();
    if (amount == null || amount <= 0) return;

    this.medicines.update((list) => [
      ...list,
      {
        name: 'Miscellaneous / Other',
        quantity: 1,
        price: Math.round(amount * 100) / 100,
        source: 'manual',
        isPriceOverridden: false,
      },
    ]);
    this.quickMiscAmount.set(null);
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
        ? 'MRP not available from source. Enter selling price manually.'
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

  updateMedicineQty(index: number, value: string | number): void {
    const parsed = typeof value === 'number' ? value : Number(value);
    const qty = Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
    this.medicines.update((list) =>
      list.map((m, i) => (i === index ? { ...m, quantity: qty } : m))
    );
  }

  updateMedicinePrice(index: number, value: string | number): void {
    const parsed = typeof value === 'number' ? value : Number(value);
    const price = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    this.medicines.update((list) =>
      list.map((m, i) => {
        if (i !== index) return m;
        const overridden = m.mrp != null ? Math.abs(price - m.mrp) > 0.0001 : false;
        return { ...m, price, isPriceOverridden: overridden };
      })
    );
  }

  updateMedicineMrp(index: number, value: string | number | null): void {
    let mrp: number | undefined;
    if (value === null || value === '' || value === undefined) {
      mrp = undefined;
    } else {
      const parsed = typeof value === 'number' ? value : Number(value);
      mrp = Number.isFinite(parsed) ? Math.max(0, parsed) : undefined;
    }
    this.medicines.update((list) =>
      list.map((m, i) => {
        if (i !== index) return m;
        const overridden = mrp != null ? Math.abs(m.price - mrp) > 0.0001 : false;
        return { ...m, mrp, isPriceOverridden: overridden };
      })
    );
  }

  // ---- Redeem ----
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

  // ---- Reward approval (#9, #11, #12, #13) ----
  acceptSuggestedPoints(): void {
    if (this.billAmount() <= 0) return;

    const suggestedPoints = this.suggestedEarnedPoints();
    this.approvedEarnedPoints.set(suggestedPoints);
    this.customEarnedPointsInput.set(suggestedPoints);
    this.showCustomPoints.set(false);
    this.rewardDecision.set('accepted');
  }

  onApproveToggle(checked: boolean): void {
    if (checked) {
      this.acceptSuggestedPoints();
    } else {
      this.rewardDecision.set('pending');
    }
  }

  toggleCustomPoints(): void {
    this.showCustomPoints.update((v) => !v);
    if (this.showCustomPoints() && this.customEarnedPointsInput() == null) {
      this.customEarnedPointsInput.set(this.suggestedEarnedPoints());
    }
  }

  onCustomEarnedPointsChange(value: string | number): void {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(parsed)) {
      this.customEarnedPointsInput.set(null);
      this.rewardDecision.set('pending');
      return;
    }

    // Integer only (#11), never below zero, never above the bill total (#12).
    const clamped = Math.min(Math.max(0, Math.floor(parsed)), this.customPointsCap());
    this.customEarnedPointsInput.set(clamped);
    this.rewardDecision.set('pending');
  }

  applyCustomEarnedPoints(): void {
    if (this.billAmount() <= 0) return;

    const approvedPoints = Math.min(
      Math.max(0, Math.floor(this.customEarnedPointsInput() ?? 0)),
      this.customPointsCap()
    );
    this.approvedEarnedPoints.set(approvedPoints);
    this.customEarnedPointsInput.set(approvedPoints);
    this.rewardDecision.set('customized');
  }

  canComplete(): boolean {
    return this.billAmount() > 0 && !!this.foundCustomer() && this.rewardDecisionResolved() && !this.isSubmitting();
  }

  // ---- Complete screen actions ----
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

  // ---- History accordions ----
  toggleHistoryBills(): void {
    this.showHistoryBills.update((v) => !v);
  }

  toggleHistoryMedicines(): void {
    this.showHistoryMedicines.update((v) => !v);
  }

  toggleBillExpanded(billId: string): void {
    this.expandedBillId.update((current) => (current === billId ? null : billId));
  }

  async repeatBill(tx: Transaction): Promise<void> {
    const hasMedicines = !!tx.medicines && tx.medicines.length > 0;
    const cartHasItems = this.medicines().length > 0;

    let mode: 'append' | 'replace' = 'append';
    if (cartHasItems) {
      const choice = await this.askChoice({
        title: `Repeat bill ${tx.billNumber}?`,
        message:
          `You already have ${this.medicines().length} item(s) in the current bill. ` +
          `Prices from the old bill are cleared — re-enter them from current inventory.`,
        actions: [
          { label: 'Append items', value: 'append', variant: 'primary' },
          { label: 'Replace items', value: 'replace', variant: 'secondary' },
          { label: 'Cancel', value: 'cancel', variant: 'ghost' },
        ],
      });
      if (choice === 'cancel' || choice === null) return;
      mode = choice as 'append' | 'replace';
    }

    const source = hasMedicines
      ? tx.medicines.map((m) => this.cloneMedicineWithoutPrice(m))
      : [this.miscLineFromAmount(tx.billAmount)];

    if (mode === 'replace' || !cartHasItems) {
      this.medicines.set(source);
    } else {
      this.medicines.update((list) => this.mergeMedicineLists(list, source));
    }

    this.resetAddMedicineRow();
    this.showHistoryBills.set(false);
  }

  private cloneMedicineWithoutPrice(m: MedicineItem): MedicineItem {
    return {
      medicineId: m.medicineId,
      name: m.name,
      manufacturer: m.manufacturer,
      packSize: m.packSize,
      mrp: undefined,
      quantity: m.quantity,
      price: 0,
      source: m.source,
      isPriceOverridden: false,
    };
  }

  private miscLineFromAmount(amount: number): MedicineItem {
    return {
      name: 'Miscellaneous / Other',
      quantity: 1,
      price: Math.round(amount * 100) / 100,
      source: 'manual',
      isPriceOverridden: false,
    };
  }

  private medicineKey(m: MedicineItem): string {
    return (m.medicineId ?? m.name).trim().toLowerCase();
  }

  private mergeMedicineLists(target: MedicineItem[], incoming: MedicineItem[]): MedicineItem[] {
    const next = target.map((m) => ({ ...m }));
    for (const item of incoming) {
      const key = this.medicineKey(item);
      if (!key) continue;
      const idx = next.findIndex((m) => this.medicineKey(m) === key);
      if (idx >= 0) {
        next[idx] = { ...next[idx], quantity: next[idx].quantity + item.quantity };
      } else {
        next.push({ ...item });
      }
    }
    return next;
  }

  async addMedicineFromHistory(med: MedicineItem): Promise<void> {
    const key = this.medicineKey(med);
    const list = this.medicines();
    const idx = list.findIndex((m) => this.medicineKey(m) === key);

    if (idx >= 0) {
      const existing = list[idx];
      const choice = await this.askChoice({
        title: `"${existing.name}" already in bill`,
        message: `It is already on the bill (qty ${existing.quantity}, ₹${existing.price.toFixed(2)}).`,
        actions: [
          { label: 'Increase qty by 1', value: 'increase', variant: 'primary' },
          { label: 'Reset (qty 1, no price)', value: 'reset', variant: 'secondary' },
          { label: 'Cancel', value: 'cancel', variant: 'ghost' },
        ],
      });
      if (choice === 'cancel' || choice === null) return;

      this.medicines.update((current) => {
        const next = [...current];
        if (choice === 'increase') {
          next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        } else {
          next[idx] = this.cloneMedicineWithoutPrice({ ...med, quantity: 1 });
        }
        return next;
      });
      return;
    }

    this.medicines.update((current) => [
      ...current,
      this.cloneMedicineWithoutPrice({ ...med, quantity: 1 }),
    ]);
  }

  private resetAddMedicineRow(): void {
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

  private resetBillingForm(): void {
    this.medicines.set([]);
    this.quickMiscAmount.set(null);
    this.resetAddMedicineRow();
    this.medicineLookupLoading.set(false);
    this.redeemEnabled.set(false);
    this.pointsToRedeemInput.set(0);
    this.lastTransaction.set(null);
    this.lastBalance.set(null);
    this.submitError.set('');
    this.isSubmitting.set(false);
    this.rewardDecision.set('pending');
    this.approvedEarnedPoints.set(0);
    this.customEarnedPointsInput.set(null);
    this.showCustomPoints.set(false);
    this.rewardDecisionBaseline = '';
    this.showHistoryBills.set(false);
    this.showHistoryMedicines.set(false);
    this.expandedBillId.set(null);
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
