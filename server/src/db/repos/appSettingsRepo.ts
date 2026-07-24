import type { AppSettings } from '@kaizen/shared';
import { DEFAULT_APP_SETTINGS } from '@kaizen/shared';
import { config } from '../../config.js';
import { db } from '../database.js';

function getRaw(key: string): string | null {
  const r = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return r?.value ?? null;
}

function setRaw(key: string, value: string): void {
  db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}

export const appSettingsRepo = {
  /** Total concurrent runs allowed across all projects. Falls back to the env-derived config default. */
  getMaxConcurrentRuns(): number {
    const raw = getRaw('maxConcurrentRuns');
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : config.maxConcurrentRuns;
  },

  setMaxConcurrentRuns(n: number): void {
    setRaw('maxConcurrentRuns', String(Math.floor(n)));
  },

  get(): AppSettings {
    return { ...DEFAULT_APP_SETTINGS, maxConcurrentRuns: this.getMaxConcurrentRuns() };
  },
};
