import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SyncService } from '../../services/sync.service';
import { TransactionService } from '../../services/transaction.service';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  syncService = inject(SyncService);
  transactionService = inject(TransactionService);

  get pendingCount(): number {
    return this.transactionService.getPending().length;
  }
}
