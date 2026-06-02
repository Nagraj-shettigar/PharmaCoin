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
