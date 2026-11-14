import { describe, expect, it } from 'vitest';
import { greedyPolicy, play, randomPolicy, type Policy } from './bot';
import { score } from './engine';

const seeds = Array.from({ length: 500 }, (_, i) => `balance-${i}`);

function summarize(policy: Policy) {
  const cards = seeds.map((seed) => score(play(seed, policy)));
  const scores = cards.map((c) => c.score).sort((a, b) => a - b);
  const grades: Record<string, number> = {};
  for (const c of cards) grades[c.grade] = (grades[c.grade] ?? 0) + 1;
  return {
    mean: scores.reduce((a, b) => a + b, 0) / scores.length,
    min: scores[0]!,
    max: scores.at(-1)!,
    percentiles: [10, 25, 50, 75, 90].map((p) => scores[Math.floor((scores.length * p) / 100)]!),
    shipped: cards.reduce((a, c) => a + c.shipped, 0) / cards.length,
    morale: cards.reduce((a, c) => a + c.morale, 0) / cards.length,
    trust: cards.reduce((a, c) => a + c.trust, 0) / cards.length,
    total: cards.reduce((a, c) => a + c.total, 0) / cards.length,
    won: cards.filter((c) => c.won).length / cards.length,
    grades,
  };
}

describe('balance', () => {
  const careful = summarize(greedyPolicy);
  const careless = summarize(randomPolicy);
  console.log({ careful, careless });

  it('rewards planning: a careful player clearly beats a careless one', () => {
    expect(careful.mean - careless.mean).toBeGreaterThan(20);
  });

  it('cannot be completed: even careful play leaves a third of the work on the table', () => {
    expect(careful.shipped / careful.total).toBeLessThan(0.67);
  });

  it('makes morale and trust worth guarding: even careful play ends well short of full meters', () => {
    expect(careful.morale).toBeLessThan(80);
    expect(careful.trust).toBeLessThan(90);
  });

  it('keeps the top grade for better-than-autopilot play', () => {
    expect((careful.grades.S ?? 0) / seeds.length).toBeLessThan(0.1);
  });

  it('almost never grades a careful win below a B', () => {
    expect(((careful.grades.C ?? 0) + (careful.grades.D ?? 0)) / seeds.length).toBeLessThan(0.03);
  });

  it('lets a careful player reliably launch, and a careless one never', () => {
    expect(careful.won).toBeGreaterThan(0.95);
    expect(careless.won).toBeLessThan(0.02);
  });
});
