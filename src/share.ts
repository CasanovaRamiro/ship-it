import { score } from './engine/engine';
import type { GameState } from './engine/types';
import { seedUrl } from './seed';

/** A spoiler-free result to paste into a chat, with a link to the same sprint. */
export function shareText(state: GameState): string {
  const card = score(state);
  const boxes = state.tickets
    .filter((t) => t.dueDay === null)
    .map((t) => (t.shippedDay === null ? '⬜' : '✅'))
    .join('');
  return [
    `📦 Ship It! · “${state.seed}”`,
    `${card.won ? '🚀 Launched' : '💥 Did not launch'} · grade ${card.grade} · ${card.score} pts · ${card.title}`,
    `${boxes} ${card.shipped}/${card.total} shipped`,
    `morale ${card.morale} · trust ${card.trust}`,
    seedUrl(state.seed),
  ].join('\n');
}
