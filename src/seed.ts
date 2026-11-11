/** Seeds live in the URL so a sprint can be shared: same link, same sprint. */

export function dailySeed(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function readSeed(): string {
  return new URLSearchParams(window.location.search).get('seed')?.slice(0, 32) || dailySeed();
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function seedUrl(seed: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', seed);
  return url.toString();
}

export function writeSeed(seed: string): void {
  window.history.replaceState(null, '', seedUrl(seed));
}
