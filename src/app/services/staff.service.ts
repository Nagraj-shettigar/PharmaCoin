import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';

const STAFF_KEY = 'hp_staff_members';
const ACTIVE_KEY = 'hp_active_staff';

/**
 * Lightweight staff registry for the "Billed by" attribution on each bill
 * (see Transaction.billedBy). Names are managed in Admin and selected at
 * billing time. Intentionally local/offline — no auth, no backend.
 */
@Injectable({ providedIn: 'root' })
export class StaffService {
  private storage = inject(StorageService);

  private staff = signal<string[]>([]);
  /** The staff member selected as the current biller for this device/session. */
  activeStaff = signal<string>('');

  constructor() {
    const saved = this.storage.get<string[]>(STAFF_KEY);
    if (saved) this.staff.set(saved);

    const active = this.storage.get<string>(ACTIVE_KEY);
    if (active && this.staff().includes(active)) {
      this.activeStaff.set(active);
    } else if (this.staff().length > 0) {
      this.activeStaff.set(this.staff()[0]);
    }
  }

  getStaff() {
    return this.staff;
  }

  addStaff(name: string): void {
    const clean = name.trim();
    if (!clean) return;
    if (this.staff().some((s) => s.toLowerCase() === clean.toLowerCase())) return;

    const updated = [...this.staff(), clean];
    this.staff.set(updated);
    this.storage.set(STAFF_KEY, updated);

    if (!this.activeStaff()) this.setActiveStaff(clean);
  }

  removeStaff(name: string): void {
    const updated = this.staff().filter((s) => s !== name);
    this.staff.set(updated);
    this.storage.set(STAFF_KEY, updated);

    if (this.activeStaff() === name) {
      this.setActiveStaff(updated[0] ?? '');
    }
  }

  setActiveStaff(name: string): void {
    this.activeStaff.set(name);
    this.storage.set(ACTIVE_KEY, name);
  }
}
