/**
 * Seeded randomness. The whole game derives from one seed string, so a sprint
 * can be replayed, shared by URL, and asserted on in tests.
 */

/** FNV-1a: turn any seed string into a 32-bit starting state. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** Current state; store it to resume the sequence later. */
  readonly state: number;
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32, wrapped so callers can read the state back out. */
export function makeRng(initial: number): Rng {
  let s = initial >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    get state() {
      return s;
    },
    next,
    int,
    pick: (items) => items[int(items.length)]!,
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}
