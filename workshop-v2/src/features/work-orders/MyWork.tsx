import { Shell } from '../../app/Shell';
import type { Person } from '../../data/people';

export function MyWork({ person }: { person: Person }) {
  const outside = person.tier === 'subcontractor';
  return (
    <Shell title="My work">
      <h1>{outside ? 'Jobs for you' : 'My work'}</h1>
      <p class="muted">{outside
        ? 'Work orders RCK has assigned to your company will appear here. Nothing yet.'
        : 'Jobs assigned to you will appear here from stage 3.'}</p>
    </Shell>
  );
}
