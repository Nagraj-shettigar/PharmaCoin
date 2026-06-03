import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RewardService } from '../../services/reward.service';
import { SyncService } from '../../services/sync.service';
import { CustomerService } from '../../services/customer.service';
import { TransactionService } from '../../services/transaction.service';
import { MedicineCatalogService } from '../../services/medicine-catalog.service';
import { AdminAuthService } from '../../services/admin-auth.service';
import { StaffService } from '../../services/staff.service';
import { RewardConfig } from '../../models/reward-config.model';
import { SyncConfig } from '../../models/sync-config.model';
import { MedicineSearchConfig } from '../../models/medicine-catalog.model';
import { DecimalPipe } from '@angular/common';

type AdminTab = 'rewards' | 'sync' | 'medicine' | 'customers' | 'staff';

@Component({
  selector: 'app-admin',
  imports: [FormsModule, RouterLink, DecimalPipe],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {
  private rewardService = inject(RewardService);
  syncService = inject(SyncService);
  private customerService = inject(CustomerService);
  private transactionService = inject(TransactionService);
  private medicineCatalogService = inject(MedicineCatalogService);
  adminAuth = inject(AdminAuthService);
  staffService = inject(StaffService);
  private router = inject(Router);

  rewardForm = signal<RewardConfig>({ ...this.rewardService.getConfig()() });
  syncForm = signal<SyncConfig>({ ...this.syncService.config() });
  medicineForm = signal<MedicineSearchConfig>({ ...this.medicineCatalogService.getConfig()() });

  rewardSaved = signal(false);
  syncSaved = signal(false);
  medicineSaved = signal(false);
  isSyncing = signal(false);

  activeTab = signal<AdminTab>('rewards');

  // Login gate (#15b)
  passwordInput = signal('');
  loginError = signal('');

  // Password change
  currentPwd = signal('');
  newPwd = signal('');
  pwdMessage = signal('');

  // Staff management (#20)
  newStaffName = signal('');

  // Customer search/filter (#17)
  customerSearch = signal('');

  filteredCustomers = computed(() => {
    const term = this.customerSearch().trim().toLowerCase();
    const all = this.customerService.getAll()();
    if (!term) return all;
    return all.filter(
      (c) => c.name.toLowerCase().includes(term) || c.mobile.includes(term)
    );
  });

  ngOnInit(): void {
    this.rewardForm.set({ ...this.rewardService.getConfig()() });
    this.syncForm.set({ ...this.syncService.config() });
    this.medicineForm.set({ ...this.medicineCatalogService.getConfig()() });
  }

  // ---- Auth ----
  login(): void {
    if (this.adminAuth.login(this.passwordInput())) {
      this.loginError.set('');
      this.passwordInput.set('');
    } else {
      this.loginError.set('Incorrect password.');
    }
  }

  logout(): void {
    this.adminAuth.logout();
  }

  changePassword(): void {
    if (!this.newPwd().trim()) {
      this.pwdMessage.set('New password cannot be empty.');
      return;
    }
    if (this.adminAuth.changePassword(this.currentPwd(), this.newPwd())) {
      this.pwdMessage.set('Password updated.');
      this.currentPwd.set('');
      this.newPwd.set('');
    } else {
      this.pwdMessage.set('Current password is incorrect.');
    }
  }

  // ---- Staff ----
  get staff() {
    return this.staffService.getStaff()();
  }

  addStaff(): void {
    this.staffService.addStaff(this.newStaffName());
    this.newStaffName.set('');
  }

  removeStaff(name: string): void {
    this.staffService.removeStaff(name);
  }

  get customers() {
    return this.customerService.getAll()();
  }

  get pendingCount(): number {
    return this.transactionService.getAll()().filter((t) => t.syncStatus === 'pending').length;
  }

  get failedCount(): number {
    return this.transactionService.getAll()().filter((t) => t.syncStatus === 'failed').length;
  }

  get syncedCount(): number {
    return this.transactionService.getAll()().filter((t) => t.syncStatus === 'synced').length;
  }

  /** Pending + failed — the queue still needing a successful sync. */
  get unsyncedCount(): number {
    return this.transactionService.getPending().length;
  }

  get syncActivity() {
    return this.syncService.activity();
  }

  get stats() {
    return this.transactionService.getStats();
  }

  get localMedicineCount(): number {
    return this.medicineCatalogService.getLocalMasterCount();
  }

  saveRewardConfig(): void {
    this.rewardService.updateConfig(this.rewardForm());
    this.rewardSaved.set(true);
    setTimeout(() => this.rewardSaved.set(false), 2500);
  }

  saveSyncConfig(): void {
    this.syncService.updateConfig(this.syncForm());
    this.syncSaved.set(true);
    setTimeout(() => this.syncSaved.set(false), 2500);
  }

  saveMedicineConfig(): void {
    this.medicineCatalogService.updateConfig(this.medicineForm());
    this.medicineSaved.set(true);
    setTimeout(() => this.medicineSaved.set(false), 2500);
  }

  async triggerSync(): Promise<void> {
    this.isSyncing.set(true);
    await this.syncService.sync();
    this.isSyncing.set(false);
  }

  viewCustomer(id: string): void {
    this.router.navigate(['/customer', id]);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
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

  clearSyncActivity(): void {
    this.syncService.clearActivity();
  }

  updateRewardField(field: keyof RewardConfig, value: number): void {
    this.rewardForm.update((f) => ({ ...f, [field]: value }));
  }

  updateSyncField<K extends keyof SyncConfig>(field: K, value: SyncConfig[K]): void {
    this.syncForm.update((f) => ({ ...f, [field]: value }));
  }

  updateMedicineField<K extends keyof MedicineSearchConfig>(
    field: K,
    value: MedicineSearchConfig[K]
  ): void {
    this.medicineForm.update((f) => ({ ...f, [field]: value }));
  }
}
