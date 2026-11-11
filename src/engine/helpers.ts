import type { GameState, Ticket, Tone } from './types';

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
