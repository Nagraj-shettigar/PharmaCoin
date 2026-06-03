import { environment } from '../../environments/environment';

export interface SyncConfig {
  apiUrl: string;
  intervalSeconds: number;
  enabled: boolean;
}

// Out of the box, point background sync at this build's backend Worker and keep
// it enabled. Admin > Sync Settings can override (the override is persisted).
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  apiUrl: environment.apiBaseUrl,
  intervalSeconds: 30,
  enabled: true,
};
