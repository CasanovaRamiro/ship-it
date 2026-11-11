import { describe, expect, it } from 'vitest';
import { greedyPolicy, play, randomPolicy } from './bot';
import { DAYS, DEMO_DAY, HOTFIX_TICKET, LOW_MORALE } from './content';
import { assign, choose, createGame, eventView, outputOf, runDay, score, setCrunch } from './engine';
import type { GameState } from './types';

const seeds = Array.from({ length: 300 }, (_, i) => `seed-${i}`);

/** A game with no events, so tests control exactly what happens. */
const quiet = (overrides: Partial<GameState> = {}): GameState => ({ ...createGame('test'), schedule: {}, ...overrides });

describe('determinism', () => {
  it('replays identically from the same seed', () => {
    expect(play('abc', randomPolicy)).toEqual(play('abc', randomPolicy));
  });

  it('gives different sprints for different seeds', () => {
    const schedules = new Set(seeds.slice(0, 20).map((s) => JSON.stringify(createGame(s).schedule)));
    expect(schedules.size).toBeGreaterThan(10);
  });

  it('always holds the demo mid-sprint and schedules four other events', () => {
    for (const seed of seeds) {
      const { schedule } = createGame(seed);
      expect(schedule[DEMO_DAY]).toBe('demo');
      expect(Object.keys(schedule)).toHaveLength(5);
      expect(schedule[DAYS]).toBeUndefined();
    }
  });
});

describe('output', () => {
  it('rewards putting specialists on their kind of work', () => {
    const s = assign(assign(quiet(), 'ada', 'payments'), 'bo', 'payments');
    expect(outputOf(s, 'ada')).toBe(4);
    expect(outputOf(s, 'bo')).toBe(2);
    expect(outputOf(assign(s, 'ada', 'login'), 'ada')).toBe(1);
  });

  it('gives the junior a bonus only when pairing', () => {
    const solo = assign(quiet(), 'cy', 'login');
    expect(outputOf(solo, 'cy')).toBe(1);
    expect(outputOf(assign(solo, 'bo', 'login'), 'cy')).toBe(2);
  });

  it('does not count a pair partner who is out sick', () => {
    const s = assign(assign(quiet(), 'bo', 'login'), 'cy', 'login');
    expect(outputOf({ ...s, out: ['bo'] }, 'cy')).toBe(1);
    expect(outputOf({ ...s, out: ['bo'] }, 'bo')).toBe(0);
  });

  it('adds a point under crunch and drops one when morale is low', () => {
    const s = assign(quiet(), 'ada', 'payments');
    expect(outputOf(setCrunch(s, true), 'ada')).toBe(5);
    expect(outputOf({ ...s, morale: LOW_MORALE - 1 }, 'ada')).toBe(3);
  });

  it('never drops an assigned dev below one point', () => {
    const s = assign(quiet({ morale: 0, slow: true }), 'cy', 'login');
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
    let s = assign(assign(quiet(), 'bo', 'dark'), 'cy', 'dark'); // 3 + 2 into a 4-point ticket
    s = runDay(s);
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
    expect(s.trust).toBe(base.trust + 5);
  });

  it('costs morale to crunch and recovers it otherwise', () => {
    const base = assign(quiet(), 'ada', 'payments');
    expect(runDay(setCrunch(base, true)).morale).toBe(base.morale - 15);
    expect(runDay(base).morale).toBe(base.morale + 3);
  });

  it('punishes a hotfix that misses its deadline and removes it', () => {
    const base = quiet();
    const s = runDay({ ...base, tickets: [...base.tickets, { ...HOTFIX_TICKET, dueDay: 1 }] });
    expect(s.trust).toBe(base.trust - 20);
    expect(s.tickets.some((t) => t.id === 'hotfix')).toBe(false);
  });

  it('ends after the last day', () => {
    let s = quiet();
    for (let i = 0; i < DAYS; i++) s = runDay(s);
    expect(s.phase).toBe('over');
    expect(runDay(s)).toBe(s);
  });
});

describe('events', () => {
  const at = (id: NonNullable<GameState['pendingEvent']>['id']) => runDay(quiet({ schedule: { 1: id } }));

  it('pauses the sprint until the player chooses', () => {
    const s = at('lunch');
    expect(s.phase).toBe('event');
    expect(s.day).toBe(1);
    expect(runDay(s)).toBe(s);
    expect(choose(s, 0).day).toBe(2);
  });

  it('lets the player trade scope instead of just adding it', () => {
    const s = at('scope-creep');
    const view = eventView(s)!;
    expect(view.choices).toHaveLength(3);
    const traded = choose(s, 1);
    expect(traded.tickets).toHaveLength(s.tickets.length);
    expect(traded.tickets.some((t) => t.id === 'ai')).toBe(true);
    expect(traded.tickets.every((t) => !t.mustHave || t.id !== 'ai')).toBe(true);
    expect(choose(s, 0).tickets).toHaveLength(s.tickets.length + 1);
  });

  it('keeps a sick dev out for exactly one day', () => {
    let s = at('sick');
    const dev = s.pendingEvent!.devId!;
    s = choose(s, 0);
    expect(s.out).toEqual([dev]);
    expect(assign(s, dev, 'login').assignments[dev]).toBeNull();
    expect(runDay(s).out).toEqual([]);
  });

  it('judges the demo on what has actually shipped', () => {
    const empty = at('demo');
    expect(choose(empty, 0).trust).toBe(empty.trust - 12);
    const shipped = { ...empty, tickets: empty.tickets.map((t, i) => (i < 2 ? { ...t, shippedDay: 1 } : t)) };
    expect(choose(shipped, 0).trust).toBe(empty.trust + 12);
  });
});

describe('whole games', () => {
  it('does not flatter a sprint that shipped only the bare minimum', () => {
    const base = createGame('test');
    const s = { ...base, tickets: base.tickets.map((t) => (t.mustHave ? { ...t, shippedDay: 1 } : t)) };
    expect(score(s)).toMatchObject({ grade: 'C', title: 'Busy, Not Done', missedMustHaves: 0 });
  });

  it('always finishes with sane numbers, however badly it is played', () => {
    for (const seed of seeds) {
      const s = play(seed, randomPolicy);
      expect(s.phase).toBe('over');
      expect(s.history).toHaveLength(DAYS);
      for (const n of [s.morale, s.trust]) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(100);
      }
      for (const t of s.tickets) expect(t.progress).toBeLessThanOrEqual(t.effort);
    }
  });

  it('penalises missing a must-have', () => {
    const s = play('test', greedyPolicy);
    const all = { ...s, tickets: s.tickets.map((t) => ({ ...t, shippedDay: 1 })) };
    const missing = { ...all, tickets: all.tickets.map((t) => (t.id === 'login' ? { ...t, shippedDay: null } : t)) };
    expect(score(all).score - score(missing).score).toBe(8 + 15);
    expect(score(missing).title).toBe('Feature Factory');
  });
});
