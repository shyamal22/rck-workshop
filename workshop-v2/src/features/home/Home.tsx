import { Shell } from '../../app/Shell';
import type { Person } from '../../data/people';

/** The three doors. Stage 0 has the frame; the doors open in later stages. */
export function Home({ person }: { person: Person }) {
  const first = person.name.split(' ')[0] || 'there';
  return (
    <Shell title="RCK Workshop">
      <h1>Hi {first}</h1>
      <div class="doors">
        <button class="door" disabled><strong>Maintenance</strong><span>Gear status, damage reports, work orders. Stage 1.</span></button>
        <button class="door" disabled><strong>Servicing</strong><span>What is due, the weekly upload. Stage 7.</span></button>
        <button class="door" disabled><strong>Manuals</strong><span>The books, on every phone. Stage 8.</span></button>
      </div>
    </Shell>
  );
}
