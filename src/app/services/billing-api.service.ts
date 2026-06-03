import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Customer } from '../models/customer.model';
import { MedicineItem, Transaction } from '../models/transaction.model';
import { SyncService } from './sync.service';

interface ApiMedicineLine {
  medicineId?: string | null;
  name: string;
  manufacturer?: string | null;
  packSize?: string | null;
  mrp?: number | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isPriceOverridden?: boolean;
  source?: 'local' | 'remote' | 'manual' | null;
}

interface BackendCustomerLookupResponse {
  found: boolean;
  customer?: {
    id: string;
    name: string;
    mobile: string;
    pointsBalance: number;
  };
}

interface BackendCustomerResponse {
  customer: {
    id: string;
    name: string;
    mobile: string;
    pointsBalance: number;
  };
}

interface BackendContextResponse {
  organizationId: string;
  organizationCode: string;
  storeId: string;
  storeCode: string;
}

interface CreateInvoiceRequest {
  organizationId: string;
  storeId: string;
  customerName: string;
  customerMobile: string;
  grossAmount: number;
  discountAmount: number;
  pointsEarned: number;
  pointsRedeemed: number;
  redemptionValue: number;
  clientTransactionId: string;
  businessDate?: string;
  medicines?: ApiMedicineLine[];
}

interface UpsertCustomerRequest {
  organizationId: string;
  storeId: string;
  mobile: string;
  name: string;
}

interface CreateInvoiceResponse {
  message: string;
  invoiceId: string;
  billNumber: string;
  customerId: string;
  pointsBalance: number;
}

interface ListCustomersResponse {
  customers: Customer[];
}

interface ListInvoicesResponse {
  invoices: Array<{
    id: string;
    transactionId: string;
    billNumber: string;
    customerId: string;
    customerName: string;
    customerMobile: string;
    billAmount: number;
    netAmount: number;
    pointsEarned: number;
    pointsRedeemed: number;
    redeemedValue: number;
    medicines: ApiMedicineLine[];
    date: string;
    syncStatus: 'synced';
  }>;
}

@Injectable({ providedIn: 'root' })
export class BillingApiService {
  private http = inject(HttpClient);
  private syncService = inject(SyncService);

  // Single source of truth for the API base — resolved from the user-configurable
  // Sync Settings (Admin) so billing and background sync never diverge.
  private get baseUrl(): string {
    return this.syncService.apiV1Base();
  }

  async lookupCustomer(mobile: string): Promise<BackendCustomerLookupResponse> {
    return firstValueFrom(
      this.http.get<BackendCustomerLookupResponse>(`${this.baseUrl}/customers`, {
        params: { mobile },
      })
    );
  }

  async getDefaultContext(): Promise<BackendContextResponse> {
    return firstValueFrom(this.http.get<BackendContextResponse>(`${this.baseUrl}/context/default`));
  }

  async upsertCustomer(payload: UpsertCustomerRequest): Promise<BackendCustomerResponse> {
    return firstValueFrom(this.http.post<BackendCustomerResponse>(`${this.baseUrl}/customers`, payload));
  }

  async createInvoice(payload: CreateInvoiceRequest): Promise<CreateInvoiceResponse> {
    return firstValueFrom(this.http.post<CreateInvoiceResponse>(`${this.baseUrl}/invoices`, payload));
  }

  async listCustomers(limit = 1000): Promise<Customer[]> {
    const response = await firstValueFrom(
      this.http.get<ListCustomersResponse>(`${this.baseUrl}/customers/all`, {
        params: { limit },
      })
    );

    return response.customers;
  }

  async listTransactions(limit = 2000): Promise<Transaction[]> {
    const response = await firstValueFrom(
      this.http.get<ListInvoicesResponse>(`${this.baseUrl}/invoices`, {
        params: { limit },
      })
    );

    return response.invoices.map((invoice) => ({
      id: invoice.transactionId,
      billNumber: invoice.billNumber,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      customerMobile: invoice.customerMobile,
      billAmount: Number(invoice.billAmount),
      medicines: this.mapApiMedicinesToItems(invoice.medicines),
      pointsEarned: Number(invoice.pointsEarned),
      pointsRedeemed: Number(invoice.pointsRedeemed),
      redeemedValue: Number(invoice.redeemedValue),
      netAmount: Number(invoice.netAmount),
      date: invoice.date,
      syncStatus: 'synced',
    }));
  }

  private mapApiMedicinesToItems(lines: ApiMedicineLine[] | undefined): MedicineItem[] {
    if (!Array.isArray(lines)) return [];
    return lines.map((line) => ({
      medicineId: line.medicineId ?? undefined,
      name: line.name,
      manufacturer: line.manufacturer ?? undefined,
      packSize: line.packSize ?? undefined,
      mrp: line.mrp ?? undefined,
      quantity: Number(line.quantity),
      price: Number(line.unitPrice),
      source: line.source ?? undefined,
      isPriceOverridden: line.isPriceOverridden ?? false,
    }));
  }
}
