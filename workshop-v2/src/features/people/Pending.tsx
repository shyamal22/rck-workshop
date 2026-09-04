import { Shell } from '../../app/Shell';
import { refreshPerson } from '../../data/session';
import type { Person } from '../../data/people';

interface Props { person: Person | null; error?: string }

/** Signed in, but nobody has given this person a tier yet. */
export function Pending({ person, error }: Props) {
  return (
    <Shell title="RCK Workshop">
      <h1>You are signed in</h1>
      {error
        ? <div class="err">Could not load your profile: {error}</div>
        : <p>…but nobody has given <b>{person?.email ?? 'this account'}</b> access yet.</p>}
      <p class="muted">Ask the workshop manager or the office to add you. Once they have, tap below or reopen the app.</p>
      <button class="primary" onClick={() => void refreshPerson()}>Check again</button>
    </Shell>
  );
}
