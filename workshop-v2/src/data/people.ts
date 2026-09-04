/* People and companies: the rows behind sign-in. */
import type { Tier } from '../domain/tiers';
import { supabase } from './supabase';

export interface Person {
  id: string;
  user_id: string | null;
  company_id: string;
  name: string;
  email: string | null;
  phone: string;
  tier: Tier;
  active: boolean;
}

export interface Company {
  id: string;
  name: string;
  kind: 'rck' | 'subcontractor';
  trade: string;
  phone: string;
  active: boolean;
}

/** My own row. The trigger on auth.users guarantees one exists after first sign-in. */
export async function fetchMe(): Promise<Person | null> {
  const { data, error } = await supabase().from('people').select('*').eq('user_id', (await supabase().auth.getUser()).data.user?.id ?? '').maybeSingle();
  if (error) throw error;
  return (data as Person | null) ?? null;
}

export async function updateMyDetails(patch: { name?: string; phone?: string }): Promise<void> {
  const me = await fetchMe();
  if (!me) throw new Error('No profile');
  const { error } = await supabase().from('people').update(patch).eq('id', me.id);
  if (error) throw error;
}
