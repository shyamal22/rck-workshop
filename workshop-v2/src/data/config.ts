/* Site configuration, read once from public/config.js (window.RCKW2_CONFIG). */

export interface SiteConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

declare global {
  interface Window { RCKW2_CONFIG?: Partial<SiteConfig> }
}

export function siteConfig(): SiteConfig {
  const c = (typeof window !== 'undefined' && window.RCKW2_CONFIG) || {};
  return {
    supabaseUrl: (c.supabaseUrl || '').replace(/\/+$/, ''),
    supabaseKey: c.supabaseKey || ''
  };
}

export function isConfigured(): boolean {
  const c = siteConfig();
  return !!c.supabaseUrl && !!c.supabaseKey;
}
