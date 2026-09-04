/* The one Supabase client. Nothing outside src/data/ imports this. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { siteConfig, isConfigured } from './config';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    if (!isConfigured()) throw new Error('Supabase is not configured: see public/config.js');
    const { supabaseUrl, supabaseKey } = siteConfig();
    client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The magic link lands on the app with the session in the URL hash;
        // supabase-js reads it out and cleans the hash before the router sees it.
        detectSessionInUrl: true,
        flowType: 'implicit'
      }
    });
  }
  return client;
}
