import type { Dev, DevId, Ticket } from './types';

export const WEEKS = 3;
export const DAYS_PER_WEEK = 5;
export const DAYS = WEEKS * DAYS_PER_WEEK;
/** Below this, everyone loses a point of output per day. */
export const LOW_MORALE = 40;
/** Below this, the client micromanages and everyone loses a point of output per day. */
export const LOW_TRUST = 30;
/** Where morale lands after someone quits: the rest are shaken, not gone. */
export const MORALE_AFTER_QUIT = 30;

export const weekOf = (day: number) => Math.ceil(day / DAYS_PER_WEEK);
export const isFriday = (day: number) => day % DAYS_PER_WEEK === 0;
export const WEEK_NAMES = ['MVP', 'Beta', 'Launch'];

export const DEVS: Record<DevId, Dev> = {
  ada: {
    id: 'ada',
    name: 'Ada',
    role: 'Senior backend',
    blurb: 'Flies through backend work. Centering a div takes all day.',
    skill: { be: 4, fe: 1 },
    pairBonus: 0,
  },
  bo: {
    id: 'bo',
    name: 'Bo',
    role: 'Frontend',
    blurb: 'Frontend first, and decent anywhere else.',
    skill: { fe: 3, be: 2 },
    pairBonus: 0,
  },
  cy: {
    id: 'cy',
    name: 'Cy',
    role: 'Junior',
    blurb: 'Slow alone, and a little dangerous near a database. Twice as fast when sharing a ticket.',
    skill: { fe: 1, be: 1 },
    pairBonus: 1,
  },
};

export const DEV_ORDER: DevId[] = ['ada', 'bo', 'cy'];

type Seed = Pick<Ticket, 'id' | 'title' | 'kind' | 'effort' | 'value'> & { mustHave?: boolean };

export function makeTicket(t: Seed, week = 1, dueDay: number | null = null): Ticket {
  return { ...t, week, mustHave: t.mustHave ?? false, progress: 0, dueDay, shippedDay: null };
}

/**
 * Each week brings more work than the team can finish, and whatever is left
 * stays on the board: choosing what not to do is the game.
 */
export const BACKLOGS: Ticket[][] = [
  [
    { id: 'login', title: 'Login flow', kind: 'fe', effort: 10, value: 8, mustHave: true },
    { id: 'payments', title: 'Payments API', kind: 'be', effort: 14, value: 12, mustHave: true },
    { id: 'dashboard', title: 'Dashboard', kind: 'fe', effort: 12, value: 8 },
    { id: 'search', title: 'Search', kind: 'be', effort: 10, value: 7 },
    { id: 'email', title: 'Email notifications', kind: 'be', effort: 6, value: 4 },
    { id: 'dark', title: 'Dark mode', kind: 'fe', effort: 4, value: 3 },
  ],
  [
    { id: 'onboarding', title: 'Onboarding tour', kind: 'fe', effort: 8, value: 6, mustHave: true },
    { id: 'roles', title: 'Roles & permissions', kind: 'be', effort: 12, value: 10, mustHave: true },
    { id: 'mobile', title: 'Mobile layout', kind: 'fe', effort: 12, value: 8 },
    { id: 'audit', title: 'Audit log', kind: 'be', effort: 8, value: 5 },
    { id: 'csv', title: 'CSV export', kind: 'be', effort: 6, value: 4 },
    { id: 'settings', title: 'Notification settings', kind: 'fe', effort: 6, value: 4 },
  ],
  [
    { id: 'billing', title: 'Billing & invoices', kind: 'be', effort: 12, value: 10, mustHave: true },
    { id: 'landing', title: 'Landing page', kind: 'fe', effort: 8, value: 7, mustHave: true },
    { id: 'load', title: 'Load testing', kind: 'be', effort: 8, value: 6 },
    { id: 'a11y', title: 'Accessibility pass', kind: 'fe', effort: 8, value: 6 },
    { id: 'analytics', title: 'Usage analytics', kind: 'be', effort: 8, value: 5 },
    { id: 'help', title: 'Help center', kind: 'fe', effort: 6, value: 4 },
  ],
].map((tickets, i) => tickets.map((t) => makeTicket(t as Seed, i + 1)));
