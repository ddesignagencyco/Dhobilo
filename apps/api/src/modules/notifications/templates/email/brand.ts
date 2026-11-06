import type { Tone } from './model';

/** Brand tokens, matched to apps/web/src/styles/globals.css (teal primary, amber accent, slate neutrals). */
export const BRAND = {
  primary: '#007c80',
  primaryDark: '#00494c',
  primaryTint: '#e6f5f5',
  accent: '#f59e0b',
  pageBg: '#eef2f6',
  card: '#ffffff',
  soft: '#f6f8fb',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  heroSub: '#bfe3e4',
} as const;

export interface ToneColors {
  /** Hero stripe and bullets. */
  solid: string;
  /** Soft panel background. */
  bg: string;
  /** Text on the soft panel (AA on `bg`). */
  fg: string;
  /** Class suffix used by the dark-mode overrides. */
  key: string;
}

export const TONES: Record<Tone, ToneColors> = {
  brand: { solid: '#007c80', bg: '#e6f5f5', fg: '#00494c', key: 'brand' },
  success: { solid: '#16a34a', bg: '#ecfdf3', fg: '#14532d', key: 'success' },
  warning: { solid: '#d97706', bg: '#fff7e6', fg: '#7a4300', key: 'warning' },
  danger: { solid: '#dc2626', bg: '#fef2f2', fg: '#7f1d1d', key: 'danger' },
  info: { solid: '#2563eb', bg: '#eff6ff', fg: '#1e3a8a', key: 'info' },
};

export const FONT_LATIN = "Inter,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";
export const FONT_URDU = "'Noto Nastaliq Urdu','Jameel Noori Nastaleeq','Nafees Nastaleeq','Noto Naskh Arabic','Segoe UI',Tahoma,Arial,sans-serif";
export const FONT_MONO = "'SF Mono','Roboto Mono',Menlo,Consolas,'Courier New',monospace";
