import type { Dev, DevId, Ticket } from './types';

export const DAYS = 8;
export const DEMO_DAY = 4;
/** Below this, everyone loses a point of output per day. */
export const LOW_MORALE = 35;

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
    blurb: 'Slow alone. Twice as fast when sharing a ticket.',
    skill: { fe: 1, be: 1 },
    pairBonus: 1,
  },
};

export const DEV_ORDER: DevId[] = ['ada', 'bo', 'cy'];

type Seed = Pick<Ticket, 'id' | 'title' | 'kind' | 'effort' | 'value'> & { mustHave?: boolean };

export function makeTicket(t: Seed, dueDay: number | null = null): Ticket {
  return { ...t, mustHave: t.mustHave ?? false, progress: 0, dueDay, shippedDay: null };
}

/** More work than the team can finish: choosing what not to do is the game. */
export const BACKLOG: Ticket[] = [
  makeTicket({ id: 'login', title: 'Login flow', kind: 'fe', effort: 10, value: 8, mustHave: true }),
  makeTicket({ id: 'payments', title: 'Payments API', kind: 'be', effort: 16, value: 13, mustHave: true }),
  makeTicket({ id: 'dashboard', title: 'Dashboard', kind: 'fe', effort: 14, value: 8 }),
  makeTicket({ id: 'search', title: 'Search', kind: 'be', effort: 12, value: 8 }),
  makeTicket({ id: 'email', title: 'Email notifications', kind: 'be', effort: 8, value: 5 }),
  makeTicket({ id: 'onboarding', title: 'Onboarding tour', kind: 'fe', effort: 8, value: 5 }),
  makeTicket({ id: 'csv', title: 'CSV export', kind: 'be', effort: 6, value: 3 }),
  makeTicket({ id: 'dark', title: 'Dark mode', kind: 'fe', effort: 4, value: 3 }),
];

export const AI_TICKET = makeTicket({ id: 'ai', title: 'AI summaries', kind: 'be', effort: 8, value: 8 });
export const HOTFIX_TICKET = makeTicket({ id: 'hotfix', title: 'Hotfix: checkout is down', kind: 'be', effort: 4, value: 0 });
