import type { ComponentChildren } from 'preact';
import { useStore } from '../data/store';
import { session, signOut } from '../data/session';
import { TIER_LABEL } from '../domain/tiers';
import { go } from './router';

interface Props { title: string; back?: string; children: ComponentChildren }

/** Top bar, sync dot, page body. Every screen sits inside one of these. */
export function Shell({ title, back, children }: Props) {
  const st = useStore(session);
  const person = st.status === 'signed_in' ? st.person : null;
  return (
    <>
      <header id="topbar">
        {back ? <button class="icon-btn" aria-label="Back" onClick={() => go(back)}>‹</button> : <span class="icon-btn" />}
        <div class="brand">
          <strong>{title}</strong>
          <span class={'dot ' + (st.status === 'signed_in' ? 'ok' : '')} title={st.status === 'signed_in' ? 'Signed in' : 'Not signed in'} />
        </div>
        {person
          ? <button class="who" onClick={() => go('#/me')} title={TIER_LABEL[person.tier]}>{person.name || 'Me'}</button>
          : <span class="icon-btn" />}
      </header>
      <main id="view">{children}</main>
      {person && (
        <footer id="foot" class="muted tiny">
          {TIER_LABEL[person.tier]} · <button class="link" onClick={() => void signOut()}>Sign out</button>
        </footer>
      )}
    </>
  );
}
