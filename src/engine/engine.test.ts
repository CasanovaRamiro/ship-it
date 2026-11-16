import { describe, expect, it } from 'vitest';
import { greedyPolicy, play, randomPolicy } from './bot';
import { BACKLOGS, DAYS, DAYS_PER_WEEK, LOW_MORALE, LOW_TRUST, MORALE_AFTER_QUIT, makeTicket } from './content';
import { DAILY_GRIND, QUIET_DAY, assign, choose, createGame, eventView, outputOf, risks, runDay, score, setCrunch } from './engine';
import { HAZARDS, RANDOM_EVENTS } from './events';
import type { DevId, GameState } from './types';

const seeds = Array.from({ length: 300 }, (_, i) => `seed-${i}`);

/** A game with no events or accidents, so tests control exactly what happens. */
const quiet = (overrides: Partial<GameState> = {}): GameState => ({
  ...createGame('test'),
  schedule: {},
  hazards: [],
  spare: [],
  ...overrides,
});

const plan = (s: GameState, who: Partial<Record<DevId, string>>) =>
  Object.entries(who).reduce((acc, [dev, ticket]) => assign(acc, dev as DevId, ticket), s);

/** Run days with nobody assigned until the given day is being planned. */
const skipTo = (s: GameState, day: number) => {
  while (s.day < day && s.phase === 'planning') s = runDay(s);
  return s;
};

const shipAll = (s: GameState, only: (id: string) => boolean = () => true): GameState => ({
  ...s,
  tickets: s.tickets.map((t) => (only(t.id) ? { ...t, progress: t.effort, shippedDay: 1 } : t)),
});

describe('determinism', () => {
  it('replays identically from the same seed', () => {
    expect(play('abc', randomPolicy)).toEqual(play('abc', randomPolicy));
  });

  it('gives different events for different seeds', () => {
    const schedules = new Set(seeds.slice(0, 20).map((s) => JSON.stringify(createGame(s).schedule)));
    expect(schedules.size).toBe(20);
  });

  it('reviews every Friday but the last, with three different events in each week', () => {
    for (const seed of seeds) {
      const { schedule, spare } = createGame(seed);
      expect(schedule[5]).toBe('review');
      expect(schedule[10]).toBe('review');
      expect(schedule[DAYS]).toBeUndefined();
      const random = Object.entries(schedule).filter(([, id]) => id !== 'review');
      expect(random).toHaveLength(9);
      for (let week = 0; week < 3; week++) {
        expect(random.filter(([day]) => Math.ceil(Number(day) / DAYS_PER_WEEK) === week + 1)).toHaveLength(3);
      }
      const ids = random.map(([, id]) => id!);
      expect(new Set([...ids, ...spare]).size).toBe(RANDOM_EVENTS.length);
    }
  });

  it('has a pool big enough that two games rarely look alike', () => {
    expect(RANDOM_EVENTS.length).toBeGreaterThanOrEqual(24);
    const a = Object.values(createGame('one').schedule);
    const b = Object.values(createGame('two').schedule);
    expect(a.filter((id) => id !== 'review' && !b.includes(id)).length).toBeGreaterThan(2);
  });
});

describe('output', () => {
  it('rewards putting specialists on their kind of work', () => {
    const s = plan(quiet(), { ada: 'payments', bo: 'payments' });
    expect(outputOf(s, 'ada')).toBe(4);
    expect(outputOf(s, 'bo')).toBe(2);
    expect(outputOf(assign(s, 'ada', 'login'), 'ada')).toBe(1);
  });

  it('gives the junior a bonus only when pairing', () => {
    const solo = assign(quiet(), 'cy', 'login');
    expect(outputOf(solo, 'cy')).toBe(1);
    expect(outputOf(assign(solo, 'bo', 'login'), 'cy')).toBe(2);
  });

  it('does not count a pair partner who is out', () => {
    const s = plan(quiet(), { bo: 'login', cy: 'login' });
    expect(outputOf({ ...s, out: ['bo'] }, 'cy')).toBe(1);
    expect(outputOf({ ...s, out: ['bo'] }, 'bo')).toBe(0);
  });

  it('adds a point under crunch and drops one when morale is low', () => {
    const s = assign(quiet(), 'ada', 'payments');
    expect(outputOf(setCrunch(s, true), 'ada')).toBe(5);
    expect(outputOf({ ...s, morale: LOW_MORALE - 1 }, 'ada')).toBe(3);
  });

  it('drops a point when the client has stopped trusting the team', () => {
    const s = assign(quiet(), 'ada', 'payments');
    expect(outputOf({ ...s, trust: LOW_TRUST - 1 }, 'ada')).toBe(3);
    expect(outputOf({ ...s, trust: LOW_TRUST - 1, morale: LOW_MORALE - 1 }, 'ada')).toBe(2);
  });

  it('applies the day’s pace and any permanent bonus', () => {
    const s = assign(quiet(), 'ada', 'payments');
    expect(outputOf({ ...s, pace: 1 }, 'ada')).toBe(5);
    expect(outputOf({ ...s, pace: -1, bonus: { ada: 2 } }, 'ada')).toBe(5);
  });

  it('never drops an assigned dev below one point', () => {
    const s = assign(quiet({ morale: 1, pace: -1 }), 'cy', 'login');
    expect(outputOf(s, 'cy')).toBe(1);
  });
});

describe('running a day', () => {
  it('lands work and moves to the next day', () => {
    const s = runDay(assign(quiet(), 'ada', 'payments'));
    expect(s.day).toBe(2);
    expect(s.tickets.find((t) => t.id === 'payments')!.progress).toBe(4);
    expect(s.history).toHaveLength(1);
  });

  it('ships a finished ticket, frees its devs and wastes the overflow', () => {
    const s = runDay(plan(quiet(), { bo: 'dark', cy: 'dark' })); // 3 + 2 into a 4-point ticket
    const dark = s.tickets.find((t) => t.id === 'dark')!;
    expect(dark.progress).toBe(4);
    expect(dark.shippedDay).toBe(1);
    expect(s.assignments.bo).toBeNull();
    expect(s.history[0]!.points).toBe(4);
    expect(s.history[0]!.valueShipped).toBe(3);
  });

  it('builds trust when a must-have ships', () => {
    const base = quiet();
    const tickets = base.tickets.map((t) => (t.id === 'login' ? { ...t, progress: t.effort - 1 } : t));
    const s = runDay(assign({ ...base, tickets }, 'bo', 'login'));
    expect(s.trust).toBe(base.trust + 3);
  });

  it('wears morale down every day, and much faster under crunch', () => {
    const base = assign(quiet(), 'ada', 'payments');
    expect(runDay(base).morale).toBe(base.morale - DAILY_GRIND);
    expect(runDay(setCrunch(base, true)).morale).toBe(base.morale - DAILY_GRIND - 18);
  });

  it('costs trust on a day when nothing ships, and pays morale back when something does', () => {
    const quietDay = runDay(assign(quiet(), 'ada', 'payments'));
    expect(quietDay.trust).toBe(60 - QUIET_DAY);
    const shipDay = runDay(plan(quiet(), { bo: 'dark', cy: 'dark' }));
    expect(shipDay.trust).toBe(60);
    expect(shipDay.morale).toBe(70 - DAILY_GRIND + 2);
  });

  it('punishes an urgent fix that misses its deadline and removes it', () => {
    const base = quiet();
    const fix = makeTicket({ id: 'hotfix', title: 'Hotfix', kind: 'be', effort: 4, value: 0 }, 1, 1);
    const s = runDay({ ...base, tickets: [...base.tickets, fix] });
    expect(s.trust).toBe(base.trust - 25 - QUIET_DAY);
    expect(s.tickets.some((t) => t.id === 'hotfix')).toBe(false);
  });
});

describe('weeks', () => {
  it('brings a new backlog and a rested team every Monday, keeping what was left', () => {
    const friday = skipTo(quiet(), 5);
    expect(friday.tickets).toHaveLength(BACKLOGS[0]!.length);
    const monday = runDay(friday);
    expect(monday.day).toBe(6);
    expect(monday.tickets).toHaveLength(BACKLOGS[0]!.length + BACKLOGS[1]!.length);
    expect(monday.tickets.filter((t) => t.week === 2).map((t) => t.id)).toEqual(BACKLOGS[1]!.map((t) => t.id));
    expect(monday.morale).toBe(friday.morale - DAILY_GRIND + 6);
  });

  it('reviews the week on what has actually shipped', () => {
    const late = runDay(skipTo(quiet({ schedule: { 5: 'review' } }), 5));
    expect(late.phase).toBe('event');
    expect(eventView(late)!.body).toContain('Login flow');
    expect(choose(late, 0).trust).toBe(late.trust - 20); // two must-haves still open

    const done = runDay(shipAll(skipTo(quiet({ schedule: { 5: 'review' } }), 5), (id) => id === 'login' || id === 'payments'));
    expect(choose(done, 0).trust).toBe(done.trust + 5);
    expect(choose(done, 0).day).toBe(6);
  });

  it('runs three weeks and then stops', () => {
    const s = skipTo(quiet(), DAYS);
    expect(s.tickets).toHaveLength(BACKLOGS.flat().length);
    const over = runDay(s);
    expect(over.phase).toBe('over');
    expect(over.history).toHaveLength(DAYS);
    expect(runDay(over)).toBe(over);
  });
});

describe('events', () => {
  const busy = () => runDay(plan(quiet(), { ada: 'payments', bo: 'login', cy: 'login' }));
  const at = (id: string) => runDay(plan({ ...busy(), schedule: { 2: id } }, { ada: 'payments', bo: 'login', cy: 'login' }));

  it('pauses the game until the player chooses', () => {
    const s = at('lunch');
    expect(s.phase).toBe('event');
    expect(s.day).toBe(2);
    expect(runDay(s)).toBe(s);
    expect(choose(s, 0).day).toBe(3);
  });

  it('can raise every event in the pool, and every choice leaves a sane game', () => {
    for (const id of RANDOM_EVENTS) {
      const s = at(id);
      expect(s.pendingEvent?.id, id).toBe(id);
      const view = eventView(s)!;
      expect(view.choices.length, id).toBeGreaterThanOrEqual(2);
      view.choices.forEach((choice, i) => {
        expect(choice.hint, id).not.toBe('');
        const next = choose(s, i);
        expect(next.day, id).toBe(3);
        expect(next.phase, id).toBe('planning');
        for (const t of next.tickets) {
          expect(t.progress, id).toBeGreaterThanOrEqual(0);
          expect(t.progress, id).toBeLessThanOrEqual(t.effort);
        }
      });
    }
  });

  it('swaps in an unseen event when the scheduled one cannot happen', () => {
    // Nothing has been started, so there is no keyboard for the dog to sleep on.
    const s = runDay(quiet({ schedule: { 1: 'office-dog' }, spare: ['lunch', 'coffee'] }));
    expect(s.pendingEvent?.id).toBe('lunch');
    expect(s.spare).toEqual(['coffee']);
  });

  it('lets the player trade scope instead of just adding it', () => {
    const s = at('scope-creep');
    expect(eventView(s)!.choices).toHaveLength(3);
    const traded = choose(s, 1);
    expect(traded.tickets).toHaveLength(s.tickets.length);
    expect(traded.tickets.some((t) => t.id === 'ai')).toBe(true);
    expect(choose(s, 0).tickets).toHaveLength(s.tickets.length + 1);
  });

  it('keeps a sick dev out for exactly one day', () => {
    let s = at('sick');
    const dev = s.pendingEvent!.devId!;
    s = choose(s, 0);
    expect(s.out).toEqual([dev]);
    expect(s.outReason[dev]).toBe('Out sick');
    expect(assign(s, dev, 'login').assignments[dev]).toBeNull();
    expect(runDay(s).out).toEqual([]);
  });

  it('makes mentoring a one-day cost with a lasting payoff', () => {
    const s = choose(at('mentoring'), 0);
    expect(s.out).toEqual(['ada']);
    expect(outputOf(assign(s, 'cy', 'dashboard'), 'cy')).toBe(2);
  });

  it('can turn a nice-to-have into a must-have', () => {
    const s = at('big-customer');
    const promised = choose(s, 0).tickets.find((t) => t.id === s.pendingEvent!.ticketId)!;
    expect(promised.mustHave).toBe(true);
  });
});

describe('accidents', () => {
  const live = (seed: string) => ({ ...createGame(seed), schedule: {} });

  it('warns about the risks the current plan is taking', () => {
    const s = live('test');
    expect(risks(plan(s, { ada: 'payments', bo: 'login', cy: 'search' })).map((r) => r.chance)).toEqual([0.25]);
    expect(risks(plan(s, { ada: 'payments', bo: 'login', cy: 'login' }))).toEqual([]);
    expect(risks(plan(s, { ada: 'payments', bo: 'payments', cy: 'payments' }))[0]!.text).toContain('merge');
    expect(risks(plan(s, { ada: 'payments', bo: 'login' }))[0]!.text).toContain('Bored');
    expect(risks(quiet())).toEqual([]);
  });

  it('lets the junior wipe the database only when left alone on backend work', () => {
    const fired = (who: Partial<Record<DevId, string>>) =>
      seeds.filter((seed) => runDay(plan(live(seed), who)).pendingEvent?.id === 'db-wipe').length;
    const alone = fired({ ada: 'payments', bo: 'login', cy: 'search' });
    expect(alone).toBeGreaterThan(seeds.length * 0.15);
    expect(alone).toBeLessThan(seeds.length * 0.35);
    expect(fired({ ada: 'payments', bo: 'login', cy: 'payments' })).toBe(0);
    expect(fired({ ada: 'payments', bo: 'login', cy: 'dark' })).toBe(0);
  });

  it('raises an accident first and still holds the scheduled event afterwards', () => {
    const seed = seeds.find((x) => runDay(plan(live(x), { ada: 'payments', bo: 'login', cy: 'search' })).phase === 'event')!;
    const s = runDay(plan({ ...live(seed), schedule: { 1: 'lunch' } }, { ada: 'payments', bo: 'login', cy: 'search' }));
    expect(s.pendingEvent?.id).toBe('db-wipe');
    const after = choose(s, 0);
    expect(after.day).toBe(1);
    expect(after.pendingEvent?.id).toBe('lunch');
    const monday = choose(after, 1);
    expect(monday.day).toBe(2);
    expect(monday.out).toEqual(['ada']);
    expect(monday.outReason.ada).toBe('Restoring the database');
  });

  it('can bite a Friday deploy, and a rollback un-ships the ticket', () => {
    const thursdayNight = (seed: string) => skipTo({ ...live(seed), hazards: ['friday-deploy'] }, 5);
    const friday = (seed: string) => runDay(plan(thursdayNight(seed), { bo: 'dark', cy: 'dark' }));
    expect(risks(plan(thursdayNight('test'), { bo: 'dark', cy: 'dark' }))[0]!.text).toContain('Friday');
    expect(risks(plan(thursdayNight('test'), { bo: 'login', cy: 'login' }))).toEqual([]);
    const s = friday(seeds.find((seed) => friday(seed).pendingEvent?.id === 'friday-deploy')!);
    const rolledBack = choose(s, 1).tickets.find((t) => t.id === 'dark')!;
    expect(rolledBack.shippedDay).toBeNull();
    expect(rolledBack.progress).toBe(rolledBack.effort - 2);
  });

  it('has a story for every hazard', () => {
    for (const h of HAZARDS) expect(createGame('test').hazards).toContain(h.id);
  });
});

describe('winning and losing', () => {
  const finished = (s: GameState) => runDay(skipTo(s, DAYS));

  it('wins when every must-have has shipped by the end', () => {
    const card = score(finished(shipAll(skipTo(quiet(), 11))));
    expect(card).toMatchObject({ won: true, missedMustHaves: 0, headline: 'You won. The product launched on time.' });
    expect(card.grade).not.toBe('F');
  });

  it('loses, and says why, when a must-have never shipped', () => {
    const card = score(finished(shipAll(skipTo(quiet(), 11), (id) => id !== 'billing')));
    expect(card).toMatchObject({ won: false, grade: 'F', missedMustHaves: 1, title: 'Feature Factory' });
    expect(card.headline).toMatch(/^You lost\..*Billing & invoices never shipped/);
  });

  it('does not flatter a launch that shipped only the bare minimum', () => {
    const musts = new Set(BACKLOGS.flat().filter((t) => t.mustHave).map((t) => t.id));
    const card = score(finished(shipAll(skipTo(quiet({ morale: 100, trust: 100 }), 11), (id) => musts.has(id))));
    expect(card).toMatchObject({ won: true, title: 'Bare Minimum' });
    expect(['C', 'D']).toContain(card.grade);
  });

  it('loses a developer for good when morale hits zero, and plays on', () => {
    const s = runDay(setCrunch(assign(quiet({ morale: 10 }), 'ada', 'payments'), true));
    expect(s.phase).toBe('planning');
    expect(s.gone).toHaveLength(1);
    expect(s.morale).toBe(MORALE_AFTER_QUIT);
    const quitter = s.gone[0]!;
    expect(s.out).toContain(quitter);
    expect(s.outReason[quitter]).toBe('Quit on day 1');
    expect(assign(s, quitter, 'login').assignments[quitter]).toBeNull();
    expect(runDay(s).out).toContain(quitter);
    expect(s.log.at(-1)!.text).toMatch(/quit\.$/);
  });

  it('picks who quits at random', () => {
    const quitters = seeds.slice(0, 40).map((seed) => runDay(setCrunch({ ...createGame(seed), schedule: {}, hazards: [], morale: 5 }, true)).gone[0]);
    expect(new Set(quitters).size).toBe(3);
  });

  it('can still launch a developer short, and says so', () => {
    const s = runDay(setCrunch(quiet({ morale: 5 }), true));
    const card = score(runDay(skipTo({ ...shipAll(skipTo({ ...s, morale: 100, trust: 100 }, 11)), morale: 100 }, DAYS)));
    expect(card).toMatchObject({ won: true, title: 'Pyrrhic Launch' });
    expect(card.headline).toMatch(/^You won\. The product launched, without (Ada|Bo|Cy)\.$/);
  });

  it('is lost once the last developer has quit', () => {
    let s = quiet({ trust: 100 });
    for (let i = 0; i < 3; i++) s = runDay(setCrunch({ ...s, morale: 5 }, true));
    expect(s.phase).toBe('over');
    expect(score(s)).toMatchObject({ won: false, grade: 'F', headline: 'You lost. The last developer quit on day 3.' });
  });

  it('never stars someone who has quit in a later event', () => {
    for (const id of RANDOM_EVENTS) {
      const s = runDay(assign({ ...quiet({ schedule: { 1: id } }), gone: ['bo', 'cy'], out: ['bo', 'cy'] }, 'ada', 'payments'));
      const text = s.pendingEvent ? JSON.stringify(eventView(s)) : '';
      expect(text, id).not.toMatch(/\b(Bo|Cy)\b/);
      expect(s.pendingEvent?.devId ?? 'ada', id).toBe('ada');
    }
  });

  it('ends early when the client loses all trust, even mid-event', () => {
    const s = runDay(quiet({ trust: 10, schedule: { 1: 'incident' } }));
    const over = choose(s, 1);
    expect(over.phase).toBe('over');
    expect(over.pendingEvent).toBeNull();
    expect(score(over).headline).toBe('You lost. The client pulled the contract on day 1.');
  });

  it('always finishes with sane numbers, however badly it is played', () => {
    for (const seed of seeds) {
      const s = play(seed, randomPolicy);
      expect(s.phase).toBe('over');
      expect(s.history.length).toBeLessThanOrEqual(DAYS);
      expect(s.history).toHaveLength(s.day);
      for (const n of [s.morale, s.trust]) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(100);
      }
      for (const t of s.tickets) {
        expect(t.progress).toBeGreaterThanOrEqual(0);
        expect(t.progress).toBeLessThanOrEqual(t.effort);
      }
      const card = score(s);
      expect(card.headline.startsWith(card.won ? 'You won.' : 'You lost.')).toBe(true);
    }
  });

  it('lets careful play win', () => {
    expect(score(play('test', greedyPolicy)).won).toBe(true);
  });
});
