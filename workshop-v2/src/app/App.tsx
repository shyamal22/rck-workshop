import { useEffect } from 'preact/hooks';
import { useStore } from '../data/store';
import { session } from '../data/session';
import { can, landing } from '../domain/tiers';
import { go, useRoute } from './router';
import { Shell } from './Shell';
import { SignIn } from '../features/people/SignIn';
import { Pending } from '../features/people/Pending';
import { MyProfile } from '../features/people/MyProfile';
import { Home } from '../features/home/Home';
import { Dashboard } from '../features/dashboard/Dashboard';
import { MyWork } from '../features/work-orders/MyWork';
import { Screen } from '../features/screen/Screen';
import { Unconfigured } from '../features/people/Unconfigured';

export function App() {
  const st = useStore(session);
  const route = useRoute();

  // Anyone without a tier lands on Pending, whatever they typed.
  const tier = st.status === 'signed_in' ? st.person?.tier ?? 'pending' : null;
  useEffect(() => {
    if (st.status !== 'signed_in') return;
    const home = landing(tier);
    if (tier === 'pending' && route.path !== '/pending') go(home);
    if (tier !== 'pending' && (route.path === '/pending' || route.path === '/signin')) go(home);
  }, [st.status, tier, route.path]);

  if (st.status === 'unconfigured') return <Unconfigured />;
  if (st.status === 'loading') return <Shell title="RCK Workshop"><p class="muted center">Opening…</p></Shell>;
  if (st.status === 'error') return <Shell title="RCK Workshop"><h1>Cannot connect</h1><div class="err">{st.message}</div><p class="muted">Check the URL and key in <code>config.js</code>.</p></Shell>;
  if (st.status === 'signed_out') return <SignIn />;

  const person = st.person;
  if (!person || person.tier === 'pending') return <Pending person={person} error={st.error} />;

  const [first] = route.parts;
  switch (first) {
    case undefined:
      // The tier decides the front door; workshop and crew get the three doors.
      if (can(person.tier, 'dashboard')) return <Dashboard person={person} />;
      if (person.tier === 'subcontractor') return <MyWork person={person} />;
      if (person.tier === 'screen') return <Screen />;
      return <Home person={person} />;
    case 'dashboard': return can(person.tier, 'dashboard') ? <Dashboard person={person} /> : <Home person={person} />;
    case 'my-work':   return <MyWork person={person} />;
    case 'me':        return <MyProfile person={person} />;
    case 'screen':    return <Screen />;
    default:          return <Shell title="Not here"><p class="muted">There is nothing at <code>{route.path}</code> yet.</p></Shell>;
  }
}
