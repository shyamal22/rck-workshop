import { useState } from 'preact/hooks';
import { Shell } from '../../app/Shell';
import { sendMagicLink } from '../../data/session';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await sendMagicLink(email);
      setSent(true);
    } catch (ex) {
      setErr((ex as Error).message || 'Could not send the link.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="RCK Workshop">
      <h1>Sign in</h1>
      {sent ? (
        <div class="card cream">
          <div class="lab">Check your email</div>
          <p>A sign-in link is on its way to <b>{email}</b>. Open it on this phone and you are in. Nothing to type.</p>
          <p class="muted tiny">No link after a minute? Check spam, or <button class="link" onClick={() => setSent(false)}>send it again</button>.</p>
        </div>
      ) : (
        <form class="stack" onSubmit={submit}>
          <p class="muted">Your email address. A link comes back; tap it and you are signed in on this phone from then on.</p>
          <label>Email
            <input type="email" inputMode="email" autocomplete="email" required value={email}
              onInput={e => setEmail((e.target as HTMLInputElement).value)} placeholder="you@rcknz.co.nz" />
          </label>
          {err && <div class="err">{err}</div>}
          <button class="primary" type="submit" disabled={busy || !email}>{busy ? 'Sending…' : 'Send me a sign-in link'}</button>
        </form>
      )}
    </Shell>
  );
}
