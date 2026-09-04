/* Who is signed in, and their profile. Everything else reads this store. */
import type { Session } from '@supabase/supabase-js';
import { isConfigured } from './config';
import { fetchMe, type Person } from './people';
import { createStore } from './store';
import { supabase } from './supabase';

export type SessionState =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'error'; message: string }
  | { status: 'signed_in'; session: Session; person: Person | null; error?: string };

export const session = createStore<SessionState>({ status: 'loading' });

let started = false;

/** Call once at boot. Follows Supabase auth from then on. */
export function startSession(): void {
  if (started) return;
  started = true;
  if (!isConfigured()) { session.set({ status: 'unconfigured' }); return; }

  let sb;
  try {
    sb = supabase();
  } catch (e) {
    // A bad URL or key in config.js must say so, not spin forever.
    session.set({ status: 'error', message: (e as Error).message });
    return;
  }
  sb.auth.onAuthStateChange((_event, s) => {
    if (!s) { session.set({ status: 'signed_out' }); return; }
    void loadPerson(s);
  });
  void sb.auth.getSession().then(({ data }) => {
    if (!data.session) session.set({ status: 'signed_out' });
    // a live session is also reported through onAuthStateChange (INITIAL_SESSION)
  }).catch(e => session.set({ status: 'error', message: (e as Error).message }));
}

async function loadPerson(s: Session): Promise<void> {
  try {
    const person = await fetchMe();
    session.set({ status: 'signed_in', session: s, person });
  } catch (e) {
    session.set({ status: 'signed_in', session: s, person: null, error: (e as Error).message });
  }
}

export async function refreshPerson(): Promise<void> {
  const st = session.get();
  if (st.status !== 'signed_in') return;
  await loadPerson(st.session);
}

export async function sendMagicLink(email: string): Promise<void> {
  const redirect = location.origin + location.pathname;
  const { error } = await supabase().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: redirect }
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
}
