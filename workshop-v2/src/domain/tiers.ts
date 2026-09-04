/* The tiers, and what each may do.

   This is the visibility matrix from docs/01-flow-and-architecture.md §2,
   as code. The database policies say the same thing in SQL; the tests
   here are the readable statement of the rule, and the SQL is checked
   against them.

   Nothing in here touches the DOM or the network. */

export const TIERS = [
  'owner', 'director', 'workshop_manager', 'workshop', 'crew', 'subcontractor', 'screen', 'pending'
] as const;
export type Tier = typeof TIERS[number];

export const TIER_LABEL: Record<Tier, string> = {
  owner: 'Owner',
  director: 'Director',
  workshop_manager: 'Workshop manager',
  workshop: 'Workshop crew',
  crew: 'RCK crew',
  subcontractor: 'Subcontractor',
  screen: 'Wall screen',
  pending: 'Not yet given access'
};

/** Everyone inside RCK, top to bottom. Subcontractors and the screen are outside it. */
export const RCK_TIERS: readonly Tier[] = ['owner', 'director', 'workshop_manager', 'workshop', 'crew'];

export const ACTIONS = [
  'backend',                 // Supabase, deploys, config
  'dashboard',
  'people.manage',           // people and their tiers, companies
  'assets.view',             // every asset and its colours
  'orders.view_all',
  'orders.view_assigned',    // jobs assigned to me or my company
  'orders.raise',
  'orders.assign',           // assign, reassign, target date
  'orders.update_assigned',  // post an update on an assigned job
  'orders.internal_notes',   // see and write notes hidden from subcontractors
  'orders.view_other_costs', // other companies' quotes and invoices
  'orders.sign_off',
  'orders.cancel',           // cancel, change severity
  'servicing.manage',        // plans, intervals, thresholds
  'servicing.upload',        // the weekly readings
  'servicing.raise',         // raise a service job from the Due list
  'manuals.view',
  'reports.view',
  'diary.own',
  'diary.anyone'
] as const;
export type Action = typeof ACTIONS[number];

const MANAGER_AND_UP: Tier[] = ['owner', 'director', 'workshop_manager'];
const WORKSHOP_AND_UP: Tier[] = [...MANAGER_AND_UP, 'workshop'];
const ALL_RCK: Tier[] = [...WORKSHOP_AND_UP, 'crew'];

const MATRIX: Record<Action, readonly Tier[]> = {
  'backend':                 ['owner'],
  'dashboard':               MANAGER_AND_UP,
  'people.manage':           ['owner', 'director'],
  'assets.view':             [...ALL_RCK, 'screen'],
  'orders.view_all':         [...ALL_RCK, 'screen'],
  'orders.view_assigned':    [...ALL_RCK, 'subcontractor'],
  'orders.raise':            ALL_RCK,
  'orders.assign':           MANAGER_AND_UP,
  'orders.update_assigned':  [...ALL_RCK, 'subcontractor'],
  'orders.internal_notes':   ALL_RCK,
  'orders.view_other_costs': WORKSHOP_AND_UP,
  'orders.sign_off':         WORKSHOP_AND_UP,
  'orders.cancel':           MANAGER_AND_UP,
  'servicing.manage':        MANAGER_AND_UP,
  'servicing.upload':        MANAGER_AND_UP,
  'servicing.raise':         WORKSHOP_AND_UP,
  'manuals.view':            ALL_RCK,
  'reports.view':            MANAGER_AND_UP,
  'diary.own':               ALL_RCK,
  'diary.anyone':            ['owner', 'director']
};

export function can(tier: Tier | null | undefined, action: Action): boolean {
  if (!tier) return false;
  return MATRIX[action].includes(tier);
}

export function isRck(tier: Tier | null | undefined): boolean {
  return !!tier && RCK_TIERS.includes(tier);
}

/** Where a person lands after sign-in. Three front doors, by tier (§15). */
export function landing(tier: Tier | null | undefined): string {
  switch (tier) {
    case 'owner':
    case 'director':
    case 'workshop_manager': return '#/dashboard';
    case 'workshop':
    case 'crew':             return '#/';
    case 'subcontractor':    return '#/my-work';
    case 'screen':           return '#/screen';
    default:                 return '#/pending';
  }
}
