import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SyncService } from '../../services/sync.service';
import { TransactionService } from '../../services/transaction.service';
import { BootstrapDataService } from '../../services/bootstrap-data.service';
import { StaffService } from '../../services/staff.service';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  syncService = inject(SyncService);
  transactionService = inject(TransactionService);
  bootstrapDataService = inject(BootstrapDataService);
  staffService = inject(StaffService);

  staffMenuOpen = signal(false);

  get staffList(): string[] {
    return this.staffService.getStaff()();
  }

  toggleStaffMenu(): void {
    this.staffMenuOpen.update((v) => !v);
  }

  closeStaffMenu(): void {
    this.staffMenuOpen.set(false);
  }

  selectStaff(name: string): void {
    this.staffService.setActiveStaff(name);
    this.closeStaffMenu();
  }

  get pendingCount(): number {
    return this.transactionService.getPending().length;
  }

  get hydrationLabel(): string {
    const status = this.bootstrapDataService.status();
    if (status === 'loading') return 'Loading Data';
    if (status === 'live') return 'Live Data';
    return 'Offline Cache';
  }
}
