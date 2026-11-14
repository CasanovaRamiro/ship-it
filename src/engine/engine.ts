/**
 * The whole game as pure functions over GameState. No React, no clock, no
 * Math.random: every transition is `(state, input) => state`, which is what
 * makes it testable, replayable from a seed, and playable by a bot.
 */
import { BACKLOGS, DAYS, DAYS_PER_WEEK, DEVS, DEV_ORDER, MORALE_AFTER_QUIT, WEEKS, WEEK_NAMES, isFriday, weekOf } from './content';
import { EVENTS, HAZARDS, RANDOM_EVENTS } from './events';
import { adjust, isOpen, note, outputOf, remaining } from './helpers';
import { hashSeed, makeRng } from './rng';
import type { DevId, EventId, GameState, Grade, Scorecard } from './types';

export { outputOf };

/** Random events per week; they land on Monday to Thursday, Friday is the review. */
const EVENTS_PER_WEEK = 3;
/** Morale lost to every working day. */
export const DAILY_GRIND = 3;
/** Trust lost on a day when nothing ships. */
export const QUIET_DAY = 3;

export function createGame(seed: string): GameState {
  const rng = makeRng(hashSeed(seed));
  const pool = rng.shuffle(RANDOM_EVENTS);
  const schedule: Partial<Record<number, EventId>> = {};
  for (let week = 0; week < WEEKS; week++) {
    const monday = week * DAYS_PER_WEEK + 1;
    const days = rng.shuffle([0, 1, 2, 3]).slice(0, EVENTS_PER_WEEK);
    for (const d of days) schedule[monday + d] = pool.shift()!;
    if (week < WEEKS - 1) schedule[monday + 4] = 'review';
  }

  return {
    seed,
    rngState: rng.state,
    day: 1,
    phase: 'planning',
    morale: 70,
    trust: 60,
    tickets: BACKLOGS[0]!.map((t) => ({ ...t })),
    assignments: { ada: null, bo: null, cy: null },
    crunch: false,
    out: [],
    outTomorrow: [],
    gone: [],
    outReason: {},
    pace: 0,
    paceTomorrow: 0,
    bonus: {},
    schedule,
    hazards: HAZARDS.map((h) => h.id),
    pendingEvent: null,
    queue: [],
    spare: pool,
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

/** Accidents today's plan is exposed to, so the risk is a choice and not a gotcha. */
export function risks(state: GameState): { text: string; chance: number }[] {
  if (state.phase !== 'planning') return [];
  return HAZARDS.flatMap((h) => {
    const text = state.hazards.includes(h.id) ? h.risk(state) : null;
    return text ? [{ text, chance: h.chance }] : [];
  });
}

const end = (state: GameState): GameState => ({ ...state, phase: 'over', pendingEvent: null, queue: [] });

/** At zero morale someone quits for good. Returns the state and whether the game can go on. */
function walkout(state: GameState): GameState {
  if (state.morale > 0) return state;
  const rng = makeRng(state.rngState);
  const staying = DEV_ORDER.filter((d) => !state.gone.includes(d));
  if (staying.length === 0) return state;
  const devId = rng.pick(staying);
  const next: GameState = {
    ...state,
    rngState: rng.state,
    morale: MORALE_AFTER_QUIT,
    gone: [...state.gone, devId],
    assignments: { ...state.assignments, [devId]: null },
    outReason: { ...state.outReason, [devId]: `Quit on day ${state.day}` },
  };
  return note(next, `Morale hit zero. ${DEVS[devId].name} quit.`, 'bad');
}

/** The game is lost outright when the client has no trust left, or nobody is left to do the work. */
const lost = (state: GameState) => state.trust <= 0 || state.gone.length === DEV_ORDER.length;

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
    next = adjust(next, { morale: 2, trust: t.mustHave || hotfix ? 3 : 0 });
    next = note(next, hotfix ? `Fixed in time: ${t.title}.` : `Shipped ${t.title}.`, 'good');
  }

  const missed = tickets.filter((t) => isOpen(t) && t.dueDay !== null && t.dueDay <= day);
  if (missed.length) {
    next = { ...next, tickets: tickets.filter((t) => !missed.includes(t)) };
    next = note(adjust(next, { trust: -25 }), `${missed[0]!.title} missed its deadline. People noticed.`, 'bad');
  }

  // Neither meter heals on its own. Deadlines wear the team down every day, and a day
  // with nothing to show makes the client nervous: shipping is what pays both back.
  const shippedToday = tickets.some((t) => t.shippedDay === day);
  next = adjust(next, { morale: -DAILY_GRIND, trust: shippedToday ? 0 : -QUIET_DAY });
  if (state.crunch) next = note(adjust(next, { morale: -18 }), 'The team worked late.', 'bad');

  // Free up anyone whose ticket is finished or gone.
  const assignments = { ...next.assignments };
  for (const devId of DEV_ORDER) {
    if (!next.tickets.some((t) => t.id === assignments[devId] && isOpen(t))) assignments[devId] = null;
  }

  next = walkout({ ...next, assignments });
  next = {
    ...next,
    history: [...next.history, { day, points, valueShipped: valueShipped(next), morale: next.morale, trust: next.trust }],
  };

  if (day >= DAYS || lost(next)) return end(next);

  // Tonight's events: an accident the plan invited, if one fires, then whatever was scheduled.
  const rng = makeRng(next.rngState);
  const queue: EventId[] = [];
  for (const hazard of rng.shuffle(HAZARDS)) {
    if (!state.hazards.includes(hazard.id) || hazard.risk(state) === null || rng.next() >= hazard.chance) continue;
    queue.push(hazard.id);
    break;
  }
  const scheduled = next.schedule[day];
  if (scheduled) queue.push(scheduled);
  return nextEvent({ ...next, rngState: rng.state, queue }, state);
}

/** Raise the next event in tonight's queue that can actually happen, or start tomorrow. */
function nextEvent(state: GameState, plan: GameState): GameState {
  const rng = makeRng(state.rngState);
  const queue = [...state.queue];
  let spare = state.spare;
  while (queue.length) {
    const id = queue.shift()!;
    const pendingEvent = EVENTS[id]!.setup(state, rng, plan);
    if (pendingEvent) return { ...state, rngState: rng.state, queue, spare, phase: 'event', pendingEvent };
    // A random event that can't happen tonight is swapped for one that hasn't been seen.
    if (RANDOM_EVENTS.includes(id) && spare.length) {
      queue.unshift(spare[0]!);
      spare = spare.slice(1);
    }
  }
  return startNextDay({ ...state, rngState: rng.state, queue, spare });
}

function startNextDay(state: GameState): GameState {
  const out = [...new Set([...state.outTomorrow, ...state.gone])];
  const assignments = { ...state.assignments };
  for (const devId of out) assignments[devId] = null;
  let next: GameState = {
    ...state,
    day: state.day + 1,
    phase: 'planning',
    pendingEvent: null,
    crunch: false,
    assignments,
    out,
    outTomorrow: [],
    pace: state.paceTomorrow,
    paceTomorrow: 0,
  };
  if (isFriday(state.day)) {
    const week = weekOf(next.day);
    next = { ...next, tickets: [...next.tickets, ...BACKLOGS[week - 1]!.map((t) => ({ ...t }))] };
    next = note(adjust(next, { morale: 6 }), `Week ${week}: ${WEEK_NAMES[week - 1]}. New tickets are on the board.`);
  }
  return next;
}

export interface EventView {
  title: string;
  body: string;
  choices: { label: string; hint: string }[];
}

export function eventView(state: GameState): EventView | null {
  const ev = state.pendingEvent;
  if (!ev) return null;
  const def = EVENTS[ev.id]!;
  return {
    title: def.title,
    body: def.body(state, ev),
    choices: def.choices(state, ev).map(({ label, hint }) => ({ label, hint })),
  };
}

export function choose(state: GameState, index: number): GameState {
  const ev = state.pendingEvent;
  if (state.phase !== 'event' || !ev) return state;
  const choice = EVENTS[ev.id]!.choices(state, ev)[index];
  if (!choice) return state;
  const next = walkout(choice.apply(state));
  return lost(next) ? end(next) : nextEvent(next, next);
}

/** Thresholds tuned against the bots in balance.test.ts: autopilot earns a B or an A, almost never an S. */
const GRADES: [number, Grade][] = [
  [88, 'S'],
  [76, 'A'],
  [60, 'B'],
  [40, 'C'],
];

export function score(state: GameState): Scorecard {
  const scoped = state.tickets.filter((t) => t.dueDay === null);
  const shipped = scoped.filter((t) => !isOpen(t)).length;
  const missed = scoped.filter((t) => t.mustHave && isOpen(t));
  const value = valueShipped(state);
  const total = Math.max(0, Math.round(value * 0.5 + state.trust * 0.25 + state.morale * 0.25 - missed.length * 15));

  let won = false;
  let grade: Grade = 'F';
  let headline: string;
  let title: string;
  let blurb: string;

  if (state.trust <= 0) {
    headline = `You lost. The client pulled the contract on day ${state.day}.`;
    title = 'Contract Cancelled';
    blurb = 'Stakeholder trust hit zero. Nobody was left who believed your dates, so there are no more dates.';
  } else if (state.gone.length === DEV_ORDER.length) {
    headline = `You lost. The last developer quit on day ${state.day}.`;
    title = 'Burnout Machine';
    blurb = 'Morale hit zero three times. There is nobody left to ship anything.';
  } else if (missed.length > 0) {
    const what = missed.length > 2 ? `${missed.length} must-haves` : missed.map((t) => t.title).join(' and ');
    headline = `You lost. The launch was called off: ${what} never shipped.`;
    title = 'Feature Factory';
    blurb = 'Plenty of activity, but the launch was waiting on the things that didn’t ship.';
  } else {
    won = true;
    grade = GRADES.find(([min]) => total >= min)?.[1] ?? 'D';
    headline = 'You won. The product launched on time.';
    title = 'Steady Hand';
    blurb = 'No drama, no heroics. Three weeks did what they said they would.';
    if (state.gone.length > 0) {
      const names = state.gone.map((d) => DEVS[d].name).join(' and ');
      headline = `You won. The product launched, without ${names}.`;
      title = 'Pyrrhic Launch';
      blurb = `It shipped. ${names} quit along the way and the leaving drinks were awkward.`;
    } else if (state.morale < 30) {
      title = 'Pyrrhic Launch';
      blurb = 'You hit the date. The team is quietly updating their résumés.';
    } else if (state.trust < 35) {
      title = 'Lone Wolf';
      blurb = 'It launched, but your stakeholders were the last to hear about it.';
    } else if (grade === 'C' || grade === 'D') {
      title = 'Bare Minimum';
      blurb = 'The must-haves went out and not much else did. It launched, technically.';
    } else if (grade === 'S') {
      title = 'Delivery Legend';
      blurb = 'The right things shipped, the team is intact, and people trust your dates.';
    } else if (state.saidNo > 1 && state.trust >= 60) {
      title = 'Scope Whisperer';
      blurb = 'You said no and people thanked you for it.';
    }
  }

  return {
    won,
    headline,
    score: total,
    grade,
    title,
    blurb,
    valueShipped: value,
    shipped,
    total: scoped.length,
    missedMustHaves: missed.length,
    morale: state.morale,
    trust: state.trust,
  };
}
