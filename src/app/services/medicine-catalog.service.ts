import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  DEFAULT_MEDICINE_MASTER,
  DEFAULT_MEDICINE_SEARCH_CONFIG,
  MedicineCatalogItem,
  MedicineSearchConfig,
} from '../models/medicine-catalog.model';
import { StorageService } from './storage.service';

const CONFIG_STORAGE_KEY = 'hp_medicine_search_config';
const MASTER_STORAGE_KEY = 'hp_medicine_master';

@Injectable({ providedIn: 'root' })
export class MedicineCatalogService {
  private storage = inject(StorageService);
  private http = inject(HttpClient);

  private config = signal<MedicineSearchConfig>(DEFAULT_MEDICINE_SEARCH_CONFIG);
  private localMaster = signal<MedicineCatalogItem[]>(DEFAULT_MEDICINE_MASTER);

  constructor() {
    const savedConfig = this.storage.get<MedicineSearchConfig>(CONFIG_STORAGE_KEY);
    if (savedConfig) {
      this.config.set({ ...DEFAULT_MEDICINE_SEARCH_CONFIG, ...savedConfig });
    }

    const savedMaster = this.storage.get<MedicineCatalogItem[]>(MASTER_STORAGE_KEY);
    if (savedMaster && savedMaster.length > 0) {
      this.localMaster.set(savedMaster);
    } else {
      this.storage.set(MASTER_STORAGE_KEY, DEFAULT_MEDICINE_MASTER);
    }
  }

  getConfig() {
    return this.config;
  }

  getLocalMasterCount(): number {
    return this.localMaster().length;
  }

  updateConfig(config: MedicineSearchConfig): void {
    const normalized: MedicineSearchConfig = {
      endpointUrl: (config.endpointUrl ?? '').trim(),
      enabled: !!config.enabled,
      minQueryLength: Math.max(1, Math.min(6, Number(config.minQueryLength) || 2)),
      maxSuggestions: Math.max(3, Math.min(20, Number(config.maxSuggestions) || 8)),
    };
    this.config.set(normalized);
    this.storage.set(CONFIG_STORAGE_KEY, normalized);
  }

  async searchMedicines(query: string): Promise<MedicineCatalogItem[]> {
    const term = query.trim();
    const cfg = this.config();
    if (term.length < cfg.minQueryLength) return [];

    const localMatches = this.searchLocal(term, cfg.maxSuggestions);

    const canTryRemote =
      cfg.enabled &&
      !!cfg.endpointUrl &&
      typeof navigator !== 'undefined' &&
      navigator.onLine;

    if (!canTryRemote) {
      return localMatches;
    }

    try {
      const remote = await this.searchRemote(term, cfg);
      if (remote.length === 0) return localMatches;
      return this.mergeById(remote, localMatches).slice(0, cfg.maxSuggestions);
    } catch {
      return localMatches;
    }
  }

  private searchLocal(term: string, limit: number): MedicineCatalogItem[] {
    const q = term.toLowerCase();
    return this.localMaster()
      .filter((m) => {
        const haystack = `${m.name} ${m.manufacturer ?? ''} ${m.packSize ?? ''}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, limit)
      .map((m) => ({ ...m, source: 'local' }));
  }

  private async searchRemote(
    term: string,
    cfg: MedicineSearchConfig
  ): Promise<MedicineCatalogItem[]> {
    const url = new URL(cfg.endpointUrl);

    if (this.isRxTermsEndpoint(url)) {
      url.searchParams.set('terms', term);
      url.searchParams.set('maxList', String(cfg.maxSuggestions));
      url.searchParams.set('ef', 'STRENGTHS_AND_FORMS');
    } else {
      url.searchParams.set('q', term);
      url.searchParams.set('limit', String(cfg.maxSuggestions));
    }

    const payload = await firstValueFrom(this.http.get<unknown>(url.toString()));

    if (this.isRxTermsEndpoint(url)) {
      return this.parseRxTermsPayload(payload, cfg.maxSuggestions);
    }

    const rows = this.extractRows(payload);

    return rows
      .map((row, idx) => this.mapRemoteRow(row, idx))
      .filter((item): item is MedicineCatalogItem => !!item)
      .map((item) => this.enrichWithLocalMrp(item))
      .slice(0, cfg.maxSuggestions);
  }

  private isRxTermsEndpoint(url: URL): boolean {
    return (
      url.hostname.includes('clinicaltables.nlm.nih.gov') &&
      url.pathname.includes('/api/rxterms/')
    );
  }

  private parseRxTermsPayload(
    payload: unknown,
    limit: number
  ): MedicineCatalogItem[] {
    if (!Array.isArray(payload) || payload.length < 4) return [];

    const codes = Array.isArray(payload[1]) ? payload[1] : [];
    const extras = payload[2] && typeof payload[2] === 'object'
      ? (payload[2] as Record<string, unknown>)
      : {};
    const displayRows = Array.isArray(payload[3]) ? payload[3] : [];

    const strengths = Array.isArray(extras['STRENGTHS_AND_FORMS'])
      ? (extras['STRENGTHS_AND_FORMS'] as unknown[])
      : [];

    const count = Math.min(limit, codes.length, displayRows.length);
    const items: MedicineCatalogItem[] = [];

    for (let i = 0; i < count; i += 1) {
      const display = Array.isArray(displayRows[i]) && typeof displayRows[i][0] === 'string'
        ? String(displayRows[i][0]).trim()
        : String(codes[i] ?? '').trim();

      if (!display) continue;

      const strengthList = Array.isArray(strengths[i])
        ? (strengths[i] as unknown[])
        : [];
      const firstStrength =
        strengthList.length > 0 && typeof strengthList[0] === 'string'
          ? String(strengthList[0]).trim()
          : undefined;

      const remoteItem: MedicineCatalogItem = {
        id: String(codes[i] ?? display),
        name: display,
        packSize: firstStrength,
        source: 'remote',
      };

      items.push(this.enrichWithLocalMrp(remoteItem));
    }

    return items;
  }

  private extractRows(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    const obj = payload as Record<string, unknown>;
    const candidates = [obj['items'], obj['results'], obj['data'], obj['medicines']];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  }

  private mapRemoteRow(row: unknown, idx: number): MedicineCatalogItem | null {
    if (!row || typeof row !== 'object') return null;
    const item = row as Record<string, unknown>;

    const name = this.readString(item, ['name', 'medicineName', 'brandName', 'title']);
    const mrp = this.readNumber(item, ['mrp', 'price', 'unitPrice']);
    if (!name) return null;

    const id =
      this.readString(item, ['id', 'skuId', 'code']) ??
      `remote-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${idx}`;

    return {
      id,
      name,
      mrp: mrp != null && mrp > 0 ? mrp : undefined,
      manufacturer: this.readString(item, ['manufacturer', 'company']),
      packSize: this.readString(item, ['packSize', 'pack', 'size']),
      source: 'remote',
    };
  }

  private enrichWithLocalMrp(item: MedicineCatalogItem): MedicineCatalogItem {
    if (item.mrp != null) return item;

    const normalized = this.normalizeName(item.name);
    const localMatch = this.localMaster().find((local) => {
      const localNormalized = this.normalizeName(local.name);
      return (
        localNormalized === normalized ||
        localNormalized.includes(normalized) ||
        normalized.includes(localNormalized)
      );
    });

    if (!localMatch) return item;

    return {
      ...item,
      mrp: localMatch.mrp,
      manufacturer: item.manufacturer ?? localMatch.manufacturer,
      packSize: item.packSize ?? localMatch.packSize,
    };
  }

  private normalizeName(name: string): string {
    return name.toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private readString(obj: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  }

  private readNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return undefined;
  }

  private mergeById(
    primary: MedicineCatalogItem[],
    secondary: MedicineCatalogItem[]
  ): MedicineCatalogItem[] {
    const seen = new Set<string>();
    const merged: MedicineCatalogItem[] = [];

    for (const item of [...primary, ...secondary]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }

    return merged;
  }
}
