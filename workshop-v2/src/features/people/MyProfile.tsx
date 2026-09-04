import { useState } from 'preact/hooks';
import { Shell } from '../../app/Shell';
import { updateMyDetails } from '../../data/people';
import { refreshPerson } from '../../data/session';
import { TIER_LABEL } from '../../domain/tiers';
import type { Person } from '../../data/people';
import { landing } from '../../domain/tiers';

export function MyProfile({ person }: { person: Person }) {
  const [name, setName] = useState(person.name);
  const [phone, setPhone] = useState(person.phone);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  async function save(e: Event) {
    e.preventDefault();
    setErr(''); setSaved(false);
    try {
      await updateMyDetails({ name: name.trim(), phone: phone.trim() });
      await refreshPerson();
      setSaved(true);
    } catch (ex) { setErr((ex as Error).message); }
  }

  return (
    <Shell title="My profile" back={landing(person.tier)}>
      <div class="card cream">
        <div class="lab">Signed in as</div>
        <div><b>{person.email}</b></div>
        <div class="muted">{TIER_LABEL[person.tier]}</div>
      </div>
      <form class="stack" onSubmit={save}>
        <label>Name <input type="text" value={name} onInput={e => setName((e.target as HTMLInputElement).value)} autocomplete="name" /></label>
        <label>Phone <input type="tel" value={phone} onInput={e => setPhone((e.target as HTMLInputElement).value)} autocomplete="tel" /></label>
        {err && <div class="err">{err}</div>}
        {saved && <div class="ok-box">Saved.</div>}
        <button class="primary" type="submit">Save</button>
      </form>
      <h2>Coming next</h2>
      <p class="muted">My work (the jobs assigned to you) and My day (your diary) live here from stage 3.</p>
    </Shell>
  );
}
