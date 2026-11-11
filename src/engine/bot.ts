/**
 * Automated players. They exist to balance the game: if a careless bot scores
 * as well as a careful one, the decisions don't matter and the design is wrong.
 */
import { DEVS, DEV_ORDER } from './content';
import { assign, choose, createGame, eventView, outputOf, runDay } from './engine';
import { isOpen, remaining } from './helpers';
import { hashSeed, makeRng, type Rng } from './rng';
import type { GameState } from './types';

export interface Policy {
  plan(state: GameState, rng: Rng): GameState;
  pick(state: GameState, choices: number, rng: Rng): number;
}

/** Assigns people at random and answers events at random. */
export const randomPolicy: Policy = {
  plan(state, rng) {
    const open = state.tickets.filter(isOpen);
    return DEV_ORDER.reduce((s, dev) => assign(s, dev, open.length ? rng.pick(open).id : null), state);
  },
  pick: (_state, choices, rng) => rng.int(choices),
};

/**
 * A sensible PM: hotfixes first, then must-haves, then the best value for the
 * effort left; specialists stay in their lane and nobody piles onto a ticket
 * that is already covered.
 */
export const greedyPolicy: Policy = {
  plan(state) {
    let s = DEV_ORDER.reduce((acc, dev) => assign(acc, dev, null), state);
    for (const devId of DEV_ORDER) {
      if (s.out.includes(devId)) continue;
      const dev = DEVS[devId];
      const best = Math.max(dev.skill.fe, dev.skill.be);
      const ranked = s.tickets
        .filter(isOpen)
        .map((t) => {
          const covered = DEV_ORDER.reduce((sum, d) => sum + (s.assignments[d] === t.id ? outputOf(s, d) : 0), 0);
          const left = remaining(t) - covered;
          const staffed = covered > 0;
          const rank =
            (t.dueDay !== null ? 1000 : 0) +
            (t.mustHave ? 100 : 0) +
            (dev.skill[t.kind] === best ? 50 : 0) +
            (dev.pairBonus && staffed ? 25 : 0) +
            (t.value / remaining(t)) * 10;
          return { t, left, rank };
        })
        .filter((x) => x.left > 0)
        .sort((a, b) => b.rank - a.rank);
      if (ranked[0]) s = assign(s, devId, ranked[0].t.id);
    }
    return s;
  },
  pick: () => 0,
};

export function play(seed: string, policy: Policy): GameState {
  const rng = makeRng(hashSeed(`bot:${seed}`));
  let state = createGame(seed);
  while (state.phase !== 'over') {
    if (state.phase === 'event') state = choose(state, policy.pick(state, eventView(state)!.choices.length, rng));
    else state = runDay(policy.plan(state, rng));
  }
  return state;
}
