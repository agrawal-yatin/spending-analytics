import { Injectable } from '@angular/core';
import { PersistenceAdapter } from './persistence';
import { AppData } from './models';

const KEY = 'familywealth_ng_v1';

@Injectable()
export class LocalStorageAdapter extends PersistenceAdapter {
  async load(): Promise<AppData | null> {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as AppData;
      return d && d.people ? d : null;
    } catch {
      return null;
    }
  }

  async save(data: AppData): Promise<void> {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Persist failed', e);
    }
  }
}
