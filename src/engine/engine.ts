/**
 * The whole game as pure functions over GameState. No React, no clock, no
 * Math.random: every transition is `(state, input) => state`, which is what
 * makes it testable, replayable from a seed, and playable by a bot.
 */
import { BACKLOG, DAYS, DEMO_DAY, DEVS, DEV_ORDER, LOW_MORALE } from './content';
import { EVENTS, OPTIONAL_EVENTS } from './events';
import { adjust, isOpen, note, remaining } from './helpers';
import { hashSeed, makeRng } from './rng';
import type { DevId, EventId, GameState, Grade, Scorecard } from './types';

export function createGame(seed: string): GameState {
  const rng = makeRng(hashSeed(seed));
  const events = rng.shuffle(OPTIONAL_EVENTS).slice(0, 4);
  const days = rng.shuffle([1, 2, 3, 5, 6, 7]).slice(0, 4);
  const schedule: Partial<Record<number, EventId>> = { [DEMO_DAY]: 'demo' };
  events.forEach((id, i) => (schedule[days[i]!] = id));

  return {
    seed,
    rngState: rng.state,
    day: 1,
    phase: 'planning',
    morale: 70,
    trust: 60,
    tickets: BACKLOG.map((t) => ({ ...t })),
    assignments: { ada: null, bo: null, cy: null },
    crunch: false,
    out: [],
    outTomorrow: [],
    slow: false,
    slowTomorrow: false,
    schedule,
    pendingEvent: null,
    saidNo: 0,
    log: [],
    history: [],
  };
}

export function assign(state: GameState, devId: DevId, ticketId: string | null): GameState {
  if (state.phase !== 'planning' || state.out.includes(devId)) return state;
  if (ticketId !== null && !state.tickets.some((t) => t.id === ticketId && isOpen(t))) return state;
  return { ...state, assignments: { ...state.assignments, [devId]: ticketId } };
}

export function setCrunch(state: GameState, crunch: boolean): GameState {
  return state.phase === 'planning' ? { ...state, crunch } : state;
}

/** Points a dev will land today given the current plan. */
export function outputOf(state: GameState, devId: DevId): number {
  const ticketId = state.assignments[devId];
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (!ticket || !isOpen(ticket) || state.out.includes(devId)) return 0;

  const dev = DEVS[devId];
  const paired = DEV_ORDER.some((other) => other !== devId && state.assignments[other] === ticketId && !state.out.includes(other));
  let points = dev.skill[ticket.kind];
  if (paired) points += dev.pairBonus;
  if (state.crunch) points += 1;
  if (state.morale < LOW_MORALE) points -= 1;
  if (state.slow) points -= 1;
  return Math.max(1, points);
}

export const valueShipped = (state: GameState) =>
  state.tickets.reduce((sum, t) => sum + (isOpen(t) ? 0 : t.value), 0);

/** Play out the planned day: land work, ship tickets, then raise an event or move on. */
export function runDay(state: GameState): GameState {
  if (state.phase !== 'planning') return state;
  const day = state.day;
  const tickets = state.tickets.map((t) => ({ ...t }));
  let points = 0;

  for (const devId of DEV_ORDER) {
    const ticket = tickets.find((t) => t.id === state.assignments[devId]);
    if (!ticket) continue;
    // Work past the finish line is wasted, as it is in real life.
    const landed = Math.min(outputOf(state, devId), remaining(ticket));
    ticket.progress += landed;
    points += landed;
  }

  let next: GameState = { ...state, tickets };

  for (const t of tickets) {
    if (!isOpen(t) || remaining(t) > 0) continue;
    t.shippedDay = day;
    const hotfix = t.dueDay !== null;
    next = adjust(next, { morale: 4, trust: t.mustHave || hotfix ? 5 : 0 });
    next = note(next, hotfix ? 'Hotfix deployed. Checkout is back.' : `Shipped ${t.title}.`, 'good');
  }

  const missed = tickets.filter((t) => isOpen(t) && t.dueDay !== null && t.dueDay <= day);
  if (missed.length) {
    next = { ...next, tickets: tickets.filter((t) => !missed.includes(t)) };
    next = note(adjust(next, { trust: -20 }), 'The hotfix missed its deadline. Customers churned.', 'bad');
  }

  if (state.crunch) next = note(adjust(next, { morale: -15 }), 'The team worked late.', 'bad');
  else next = adjust(next, { morale: 3 });

  // Free up anyone whose ticket is finished or gone.
  const assignments = { ...next.assignments };
  for (const devId of DEV_ORDER) {
    if (!next.tickets.some((t) => t.id === assignments[devId] && isOpen(t))) assignments[devId] = null;
  }

  next = {
    ...next,
    assignments,
    history: [...next.history, { day, points, valueShipped: valueShipped(next), morale: next.morale, trust: next.trust }],
  };

  if (day >= DAYS) return { ...next, phase: 'over' };

  const eventId = next.schedule[day];
  if (eventId) {
    const rng = makeRng(next.rngState);
    const pendingEvent = EVENTS[eventId].setup(next, rng);
    next = { ...next, rngState: rng.state };
    if (pendingEvent) return { ...next, phase: 'event', pendingEvent };
  }
  return startNextDay(next);
}

function startNextDay(state: GameState): GameState {
  const out = state.outTomorrow;
  const assignments = { ...state.assignments };
  for (const devId of out) assignments[devId] = null;
  return {
    ...state,
    day: state.day + 1,
    phase: 'planning',
    pendingEvent: null,
    crunch: false,
    assignments,
    out,
    outTomorrow: [],
    slow: state.slowTomorrow,
    slowTomorrow: false,
  };
}

export interface EventView {
  title: string;
  body: string;
  choices: { label: string; hint: string }[];
}

export function eventView(state: GameState): EventView | null {
  const ev = state.pendingEvent;
  if (!ev) return null;
  const def = EVENTS[ev.id];
  return {
    title: def.title,
    body: def.body(state, ev),
    choices: def.choices(state, ev).map(({ label, hint }) => ({ label, hint })),
  };
}

export function choose(state: GameState, index: number): GameState {
  const ev = state.pendingEvent;
  if (state.phase !== 'event' || !ev) return state;
  const choice = EVENTS[ev.id].choices(state, ev)[index];
  return choice ? startNextDay(choice.apply(state)) : state;
}

/** Thresholds tuned against the bots in balance.test.ts: autopilot earns a B or an A, never an S. */
const GRADES: [number, Grade][] = [
  [88, 'S'],
  [76, 'A'],
  [62, 'B'],
  [45, 'C'],
];

export function score(state: GameState): Scorecard {
  const scoped = state.tickets.filter((t) => t.dueDay === null);
  const shipped = scoped.filter((t) => !isOpen(t)).length;
  const missedMustHaves = scoped.filter((t) => t.mustHave && isOpen(t)).length;
  const value = valueShipped(state);
  const total = Math.max(0, Math.round(value + state.trust * 0.25 + state.morale * 0.15 - missedMustHaves * 15));
  const grade = GRADES.find(([min]) => total >= min)?.[1] ?? 'D';

  let title = 'Steady Hand';
  let blurb = 'No drama, no heroics. The sprint did what it said it would.';
  if (missedMustHaves > 0) {
    title = 'Feature Factory';
    blurb = 'Plenty of activity, but the launch was waiting on the things that didn’t ship.';
  } else if (state.morale < 30) {
    title = 'Burnout Machine';
    blurb = 'You hit the date. The team is quietly updating their résumés.';
  } else if (state.trust < 35) {
    title = 'Lone Wolf';
    blurb = 'Solid output, but your stakeholders were the last to hear about it.';
  } else if (grade === 'C' || grade === 'D') {
    title = 'Busy, Not Done';
    blurb = 'Everyone was busy all sprint. Very little of it crossed the finish line.';
  } else if (grade === 'S') {
    title = 'Delivery Legend';
    blurb = 'The right things shipped, the team is intact, and people trust your dates.';
  } else if (state.saidNo > 0 && state.trust >= 60) {
    title = 'Scope Whisperer';
    blurb = 'You said no and people thanked you for it.';
  }

  return { score: total, grade, title, blurb, valueShipped: value, shipped, total: scoped.length, missedMustHaves, morale: state.morale, trust: state.trust };
}
