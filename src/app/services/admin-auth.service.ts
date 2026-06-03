import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';

const PASSWORD_KEY = 'hp_admin_password';
const DEFAULT_PASSWORD = 'admin';

/**
 * Minimal password protection for the Admin area. A single shared password is
 * stored locally (changeable from within Admin). Authentication is held only in
 * memory, so it resets when the app reloads — appropriate for a shared till.
 */
@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private storage = inject(StorageService);

  /** True once the correct password has been entered this session. */
  authenticated = signal<boolean>(false);

  private getPassword(): string {
    return this.storage.get<string>(PASSWORD_KEY) ?? DEFAULT_PASSWORD;
  }

  /** Returns true and unlocks Admin when the password matches. */
  login(password: string): boolean {
    if (password === this.getPassword()) {
      this.authenticated.set(true);
      return true;
    }
    return false;
  }

  logout(): void {
    this.authenticated.set(false);
  }

  isUsingDefaultPassword(): boolean {
    return this.getPassword() === DEFAULT_PASSWORD;
  }

  /** Change the password; requires the current password to match. */
  changePassword(current: string, next: string): boolean {
    if (current !== this.getPassword()) return false;
    const clean = next.trim();
    if (!clean) return false;
    this.storage.set(PASSWORD_KEY, clean);
    return true;
  }
}
