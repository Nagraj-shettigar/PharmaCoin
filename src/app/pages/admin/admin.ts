import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RewardService } from '../../services/reward.service';
import { SyncService } from '../../services/sync.service';
import { CustomerService } from '../../services/customer.service';
import { TransactionService } from '../../services/transaction.service';
import { MedicineCatalogService } from '../../services/medicine-catalog.service';
import { RewardConfig } from '../../models/reward-config.model';
import { SyncConfig } from '../../models/sync-config.model';
import { MedicineSearchConfig } from '../../models/medicine-catalog.model';
import { DecimalPipe } from '@angular/common';

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
  private router = inject(Router);

  rewardForm = signal<RewardConfig>({ ...this.rewardService.getConfig()() });
  syncForm = signal<SyncConfig>({ ...this.syncService.config() });
  medicineForm = signal<MedicineSearchConfig>({ ...this.medicineCatalogService.getConfig()() });

  rewardSaved = signal(false);
  syncSaved = signal(false);
  medicineSaved = signal(false);
  isSyncing = signal(false);

  activeTab = signal<'rewards' | 'sync' | 'medicine' | 'customers'>('rewards');

  ngOnInit(): void {
    this.rewardForm.set({ ...this.rewardService.getConfig()() });
    this.syncForm.set({ ...this.syncService.config() });
    this.medicineForm.set({ ...this.medicineCatalogService.getConfig()() });
  }

  get customers() {
    return this.customerService.getAll()();
  }

  get pendingCount(): number {
    return this.transactionService.getPending().length;
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
