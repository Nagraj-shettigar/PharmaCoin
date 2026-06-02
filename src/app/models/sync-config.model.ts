export interface SyncConfig {
  apiUrl: string;
  intervalSeconds: number;
  enabled: boolean;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  apiUrl: '',
  intervalSeconds: 30,
  enabled: false,
};
