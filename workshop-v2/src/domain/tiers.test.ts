import { describe, it, expect } from 'vitest';
import { ACTIONS, TIERS, can, isRck, landing, type Action, type Tier } from './tiers';

const every = (tier: Tier) => ACTIONS.filter(a => can(tier, a));

describe('the visibility matrix', () => {
  it('owner can do everything', () => {
    expect(every('owner')).toEqual([...ACTIONS]);
  });

  it('director can do everything in the app but not the back end', () => {
    expect(every('director')).toEqual(ACTIONS.filter(a => a !== 'backend'));
  });

  it('workshop manager runs the work but does not manage people or diaries of others', () => {
    const m = every('workshop_manager');
    expect(m).not.toContain('backend');
    expect(m).not.toContain('people.manage');
    expect(m).not.toContain('diary.anyone');
    for (const a of ['orders.assign', 'orders.sign_off', 'orders.cancel', 'servicing.upload', 'dashboard', 'reports.view'] as Action[]) {
      expect(m).toContain(a);
    }
  });

  it('workshop crew work jobs and sign off, but do not assign or cancel', () => {
    const w = every('workshop');
    expect(w).toContain('orders.sign_off');
    expect(w).toContain('orders.view_other_costs');
    expect(w).toContain('servicing.raise');
    expect(w).not.toContain('orders.assign');
    expect(w).not.toContain('orders.cancel');
    expect(w).not.toContain('servicing.manage');
    expect(w).not.toContain('dashboard');
  });

  it('RCK crew see everything and raise jobs, but do not sign off or see outside costs', () => {
    const c = every('crew');
    expect(c).toContain('assets.view');
    expect(c).toContain('orders.view_all');
    expect(c).toContain('orders.raise');
    expect(c).toContain('orders.internal_notes');
    expect(c).toContain('diary.own');
    expect(c).not.toContain('orders.sign_off');
    expect(c).not.toContain('orders.view_other_costs');
    expect(c).not.toContain('servicing.raise');
  });

  it('a subcontractor sees and updates only what is assigned to their company', () => {
    expect(every('subcontractor')).toEqual(['orders.view_assigned', 'orders.update_assigned']);
  });

  it('the wall screen only looks', () => {
    expect(every('screen')).toEqual(['assets.view', 'orders.view_all']);
  });

  it('a pending person can do nothing', () => {
    expect(every('pending')).toEqual([]);
    expect(can(null, 'assets.view')).toBe(false);
  });

  it('each tier sees at least what the tier below it sees, inside RCK', () => {
    const chain: Tier[] = ['owner', 'director', 'workshop_manager', 'workshop', 'crew'];
    for (let i = 0; i < chain.length - 1; i++) {
      const above = every(chain[i]!);
      const below = every(chain[i + 1]!);
      // the one deliberate exception: only owner and director read others' diaries,
      // and that is above the manager anyway, so the chain holds
      for (const a of below) expect(above).toContain(a);
    }
  });
});

describe('who is inside RCK', () => {
  it('is the five RCK tiers and nobody else', () => {
    expect(TIERS.filter(isRck)).toEqual(['owner', 'director', 'workshop_manager', 'workshop', 'crew']);
  });
});

describe('landing screens', () => {
  it('sends each tier through its own front door', () => {
    expect(landing('owner')).toBe('#/dashboard');
    expect(landing('director')).toBe('#/dashboard');
    expect(landing('workshop_manager')).toBe('#/dashboard');
    expect(landing('workshop')).toBe('#/');
    expect(landing('crew')).toBe('#/');
    expect(landing('subcontractor')).toBe('#/my-work');
    expect(landing('screen')).toBe('#/screen');
    expect(landing('pending')).toBe('#/pending');
    expect(landing(null)).toBe('#/pending');
  });
});
