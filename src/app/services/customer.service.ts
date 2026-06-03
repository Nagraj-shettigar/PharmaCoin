import { Injectable, inject, signal } from '@angular/core';
import { Customer } from '../models/customer.model';
import { StorageService } from './storage.service';

const STORAGE_KEY = 'hp_customers';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private storage = inject(StorageService);
  private customers = signal<Customer[]>([]);

  constructor() {
    const saved = this.storage.get<Customer[]>(STORAGE_KEY);
    if (saved) this.customers.set(saved);
  }

  getAll() {
    return this.customers;
  }

  findByMobile(mobile: string): Customer | undefined {
    return this.customers().find((c) => c.mobile === mobile.trim());
  }

  findById(id: string): Customer | undefined {
    return this.customers().find((c) => c.id === id);
  }

  create(name: string, mobile: string): Customer {
    const customer: Customer = {
      id: this.generateId(),
      name: name.trim(),
      mobile: mobile.trim(),
      pointsBalance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [...this.customers(), customer];
    this.customers.set(updated);
    this.persist();
    return customer;
  }

  upsertFromBackend(customer: {
    id?: string;
    name: string;
    mobile: string;
    pointsBalance: number;
  }): Customer {
    const mobile = customer.mobile.trim();
    const existing = this.findByMobile(mobile);
    const now = new Date().toISOString();

    if (existing) {
      const updatedCustomer: Customer = {
        ...existing,
        name: customer.name.trim(),
        mobile,
        pointsBalance: Math.max(0, Math.floor(customer.pointsBalance)),
        updatedAt: now,
      };

      const updated = this.customers().map((c) => (c.id === existing.id ? updatedCustomer : c));
      this.customers.set(updated);
      this.persist();
      return updatedCustomer;
    }

    const created: Customer = {
      id: customer.id?.trim() || this.generateId(),
      name: customer.name.trim(),
      mobile,
      pointsBalance: Math.max(0, Math.floor(customer.pointsBalance)),
      createdAt: now,
      updatedAt: now,
    };

    this.customers.set([...this.customers(), created]);
    this.persist();
    return created;
  }

  /**
   * Update a customer's editable profile fields. `name` is always allowed;
   * `mobile` is the identity key, so it is rejected if another customer already
   * uses the new number. Returns the updated customer, or throws on conflict.
   */
  updateProfile(customerId: string, changes: { name?: string; mobile?: string }): Customer {
    const existing = this.findById(customerId);
    if (!existing) {
      throw new Error('Customer not found.');
    }

    const nextName = changes.name?.trim() ?? existing.name;
    const nextMobile = changes.mobile?.trim() ?? existing.mobile;

    if (!nextName) {
      throw new Error('Name cannot be empty.');
    }

    if (nextMobile !== existing.mobile) {
      if (!/^\d{10}$/.test(nextMobile)) {
        throw new Error('Enter a valid 10-digit mobile number.');
      }
      const clash = this.customers().find((c) => c.id !== customerId && c.mobile === nextMobile);
      if (clash) {
        throw new Error(`Mobile ${nextMobile} already belongs to ${clash.name}.`);
      }
    }

    const updatedCustomer: Customer = {
      ...existing,
      name: nextName,
      mobile: nextMobile,
      updatedAt: new Date().toISOString(),
    };

    this.customers.set(this.customers().map((c) => (c.id === customerId ? updatedCustomer : c)));
    this.persist();
    return updatedCustomer;
  }

  setPointsBalance(customerId: string, pointsBalance: number): void {
    const now = new Date().toISOString();
    const safeBalance = Math.max(0, Math.floor(pointsBalance));
    const updated = this.customers().map((c) =>
      c.id === customerId
        ? {
            ...c,
            pointsBalance: safeBalance,
            updatedAt: now,
          }
        : c
    );

    this.customers.set(updated);
    this.persist();
  }

  hydrateFromBackend(customers: Customer[]): void {
    const byMobile = new Map<string, Customer>();

    for (const customer of this.customers()) {
      byMobile.set(customer.mobile.trim(), customer);
    }

    for (const customer of customers) {
      byMobile.set(customer.mobile.trim(), {
        ...customer,
        pointsBalance: Math.max(0, Math.floor(customer.pointsBalance)),
      });
    }

    this.customers.set(Array.from(byMobile.values()));
    this.persist();
  }

  updatePoints(customerId: string, pointsDelta: number): void {
    const updated = this.customers().map((c) =>
      c.id === customerId
        ? {
            ...c,
            pointsBalance: Math.max(0, c.pointsBalance + pointsDelta),
            updatedAt: new Date().toISOString(),
          }
        : c
    );
    this.customers.set(updated);
    this.persist();
  }

  private persist(): void {
    this.storage.set(STORAGE_KEY, this.customers());
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
}
