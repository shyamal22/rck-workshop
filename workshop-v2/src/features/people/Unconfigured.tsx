import { Shell } from '../../app/Shell';

export function Unconfigured() {
  return (
    <Shell title="RCK Workshop">
      <h1>Not set up yet</h1>
      <p>This copy of the app does not know which database to talk to.</p>
      <p class="muted">Put the Supabase project URL and anon key into <code>config.js</code> next to the app, then reload. The README in <code>workshop-v2/</code> has the steps.</p>
    </Shell>
  );
}
