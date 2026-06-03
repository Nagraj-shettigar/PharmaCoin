import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from './components/navbar/navbar';
import { SyncService } from './services/sync.service';
import { BootstrapDataService } from './services/bootstrap-data.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private syncService = inject(SyncService);
  private bootstrapDataService = inject(BootstrapDataService);

  async ngOnInit(): Promise<void> {
    await this.bootstrapDataService.hydrateFromBackend();
    this.syncService.startAutoSync();
  }
}
