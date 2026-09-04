import { Shell } from '../../app/Shell';
import type { Person } from '../../data/people';
import { can } from '../../domain/tiers';

export function Dashboard({ person }: { person: Person }) {
  return (
    <Shell title="Dashboard">
      <h1>Across everything</h1>
      <div class="card"><div class="lab">Fleet</div><p class="muted">Green, orange and red counts arrive with stage 1.</p></div>
      <div class="card"><div class="lab">Open jobs</div><p class="muted">By status and who is on each, from stage 2.</p></div>
      <div class="card"><div class="lab">Servicing</div><p class="muted">Due this fortnight, from stage 7.</p></div>
      {can(person.tier, 'backend') && (
        <div class="card cream"><div class="lab">Back end</div><p class="muted">Owner only. The Supabase project, deploys and audit. A link here once there is something to link to.</p></div>
      )}
    </Shell>
  );
}
