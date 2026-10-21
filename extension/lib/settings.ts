/** The DJ's defaults, kept in this browser. Every setting has a default, so a missing value is never an error. */
import type { Store } from './types';

export interface Settings {
  /** the store whose Purchase button leads */
  marketplace: Store;
  /** where a track's preview comes from first; the other is the fallback */
  preview: 'beatport' | 'apple' | 'off';
  theme: 'system' | 'dark' | 'light';
  /** start identifying as soon as a mix without a tracklist is read */
  autoListen: boolean;
}

export const DEFAULTS: Settings = { marketplace: 'beatport', preview: 'beatport', theme: 'system', autoListen: true };

export async function settings(): Promise<Settings> {
  return { ...DEFAULTS, ...((await browser.storage.local.get('settings')).settings as Partial<Settings> | undefined) };
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await browser.storage.local.set({ settings: { ...(await settings()), [key]: value } });
}
