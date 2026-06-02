export interface MedicineCatalogItem {
  id: string;
  name: string;
  mrp?: number;
  manufacturer?: string;
  packSize?: string;
  source: 'local' | 'remote';
}

export interface MedicineSearchConfig {
  endpointUrl: string;
  enabled: boolean;
  minQueryLength: number;
  maxSuggestions: number;
}

export const DEFAULT_MEDICINE_SEARCH_CONFIG: MedicineSearchConfig = {
  endpointUrl: 'https://clinicaltables.nlm.nih.gov/api/rxterms/v3/search',
  enabled: true,
  minQueryLength: 2,
  maxSuggestions: 8,
};

export const DEFAULT_MEDICINE_MASTER: MedicineCatalogItem[] = [
  { id: 'loc-001', name: 'Dolo 650 Tablet', mrp: 32, manufacturer: 'Micro Labs', packSize: '15 tablets', source: 'local' },
  { id: 'loc-002', name: 'Crocin Advance 500 Tablet', mrp: 20, manufacturer: 'GSK', packSize: '15 tablets', source: 'local' },
  { id: 'loc-003', name: 'Azithral 500 Tablet', mrp: 122, manufacturer: 'Alembic', packSize: '5 tablets', source: 'local' },
  { id: 'loc-004', name: 'Augmentin 625 Tablet', mrp: 210, manufacturer: 'GSK', packSize: '6 tablets', source: 'local' },
  { id: 'loc-005', name: 'Pantocid 40 Tablet', mrp: 132, manufacturer: 'Sun Pharma', packSize: '15 tablets', source: 'local' },
  { id: 'loc-006', name: 'Ecosprin 75 Tablet', mrp: 16, manufacturer: 'USV', packSize: '14 tablets', source: 'local' },
  { id: 'loc-007', name: 'Shelcal 500 Tablet', mrp: 128, manufacturer: 'Torrent', packSize: '15 tablets', source: 'local' },
  { id: 'loc-008', name: 'Glycomet 500 Tablet', mrp: 26, manufacturer: 'USV', packSize: '20 tablets', source: 'local' },
  { id: 'loc-009', name: 'Telma 40 Tablet', mrp: 118, manufacturer: 'Glenmark', packSize: '15 tablets', source: 'local' },
  { id: 'loc-010', name: 'Amlodac 5 Tablet', mrp: 31, manufacturer: 'Zydus', packSize: '15 tablets', source: 'local' },
  { id: 'loc-011', name: 'Calpol 650 Tablet', mrp: 34, manufacturer: 'GSK', packSize: '15 tablets', source: 'local' },
  { id: 'loc-012', name: 'Montek LC Tablet', mrp: 226, manufacturer: 'Sun Pharma', packSize: '15 tablets', source: 'local' },
  { id: 'loc-013', name: 'Rantac 150 Tablet', mrp: 31, manufacturer: 'J B Chemicals', packSize: '30 tablets', source: 'local' },
  { id: 'loc-014', name: 'Zerodol SP Tablet', mrp: 123, manufacturer: 'Ipca', packSize: '10 tablets', source: 'local' },
  { id: 'loc-015', name: 'Ondem MD 4 Tablet', mrp: 60, manufacturer: 'Alkem', packSize: '10 tablets', source: 'local' },
  { id: 'loc-016', name: 'Cetzine 10 Tablet', mrp: 23, manufacturer: 'Dr Reddys', packSize: '10 tablets', source: 'local' },
  { id: 'loc-017', name: 'Becosules Capsule', mrp: 52, manufacturer: 'Pfizer', packSize: '20 capsules', source: 'local' },
  { id: 'loc-018', name: 'Liv 52 Tablet', mrp: 182, manufacturer: 'Himalaya', packSize: '100 tablets', source: 'local' },
  { id: 'loc-019', name: 'Digene Gel Mint', mrp: 138, manufacturer: 'Abbott', packSize: '450 ml', source: 'local' },
  { id: 'loc-020', name: 'ORS Electral Powder', mrp: 23, manufacturer: 'FDC', packSize: '21.8 g', source: 'local' },
];
