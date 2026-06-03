export interface MedicineItem {
  medicineId?: string;
  name: string;
  manufacturer?: string;
  packSize?: string;
  mrp?: number;
  quantity: number;
  price: number;
  source?: 'local' | 'remote' | 'manual';
  isPriceOverridden?: boolean;
}

export interface Transaction {
  id: string;
  billNumber: string;
  customerId: string;
  customerName: string;
  customerMobile: string;
  billAmount: number;
  medicines: MedicineItem[];
  pointsEarned: number;
  pointsRedeemed: number;
  redeemedValue: number;
  netAmount: number;
  date: string;
  /** Name of the staff member who created the bill (free-text / selected). */
  billedBy?: string;
  syncStatus: 'pending' | 'synced' | 'failed';
}
