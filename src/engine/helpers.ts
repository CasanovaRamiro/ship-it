import { DEVS, DEV_ORDER, LOW_MORALE, LOW_TRUST } from './content';
import type { DevId, GameState, Ticket, Tone } from './types';

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function adjust(state: GameState, delta: { morale?: number; trust?: number }): GameState {
  return {
    ...state,
    morale: clamp(state.morale + (delta.morale ?? 0)),
    trust: clamp(state.trust + (delta.trust ?? 0)),
  };
}

export function note(state: GameState, text: string, tone: Tone = 'info'): GameState {
  return { ...state, log: [...state.log, { day: state.day, text, tone }] };
}

export const isOpen = (t: Ticket) => t.shippedDay === null;
export const remaining = (t: Ticket) => t.effort - t.progress;

/** The open ticket a dev is actually working on today, if any. */
export function ticketOf(state: GameState, devId: DevId): Ticket | undefined {
  if (state.out.includes(devId)) return undefined;
  return state.tickets.find((t) => t.id === state.assignments[devId] && isOpen(t));
}

/** Everyone working on a ticket today. */
export const crewOf = (state: GameState, ticketId: string): DevId[] =>
  DEV_ORDER.filter((d) => ticketOf(state, d)?.id === ticketId);

/** Points a dev will land today given the current plan. */
export function outputOf(state: GameState, devId: DevId): number {
  const ticket = ticketOf(state, devId);
  if (!ticket) return 0;

  const dev = DEVS[devId];
  let points = dev.skill[ticket.kind] + (state.bonus[devId] ?? 0) + state.pace;
  if (crewOf(state, ticket.id).length > 1) points += dev.pairBonus;
  if (state.crunch) points += 1;
  if (state.morale < LOW_MORALE) points -= 1;
  if (state.trust < LOW_TRUST) points -= 1;
  return Math.max(1, points);
}
