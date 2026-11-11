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
    missedMustHave: cards.filter((c) => c.missedMustHaves > 0).length / cards.length,
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

  it('cannot be completed: even careful play leaves work on the table', () => {
    expect(careful.shipped).toBeLessThan(7.5);
  });

  it('keeps the top grade for better-than-autopilot play', () => {
    expect((careful.grades.S ?? 0) / seeds.length).toBeLessThan(0.1);
  });

  it('never grades careful play below a B', () => {
    expect(careful.grades.C ?? 0).toBe(0);
    expect(careful.grades.D ?? 0).toBe(0);
  });

  it('lets a careful player reliably ship the must-haves', () => {
    expect(careful.missedMustHave).toBeLessThan(0.05);
  });
});
