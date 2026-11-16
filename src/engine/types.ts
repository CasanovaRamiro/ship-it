export type Skill = 'fe' | 'be';
export type DevId = 'ada' | 'bo' | 'cy';

export interface Dev {
  id: DevId;
  name: string;
  role: string;
  blurb: string;
  /** Points of work per day on a ticket of each kind. */
  skill: Record<Skill, number>;
  /** Extra points when sharing a ticket with a teammate. */
  pairBonus: number;
}

export interface Ticket {
  id: string;
  title: string;
  kind: Skill;
  effort: number;
  progress: number;
  /** The week this ticket landed on the board. */
  week: number;
  /** Business value, counted only once the ticket ships. */
  value: number;
  mustHave: boolean;
  /** Hotfixes must ship by the end of this day. */
  dueDay: number | null;
  shippedDay: number | null;
}

export type Phase = 'planning' | 'event' | 'over';

/** A key of EVENTS in events.ts. */
export type EventId = string;

/** An event waiting on the player, with whatever it rolled when it fired. */
export interface PendingEvent {
  id: EventId;
  devId?: DevId;
  ticketId?: string;
  /** Which flavour of the story to tell, for events with several. */
  variant?: number;
}

export type Tone = 'good' | 'bad' | 'info';

export interface LogEntry {
  day: number;
  text: string;
  tone: Tone;
}

export interface DayRecord {
  day: number;
  /** Points of work landed that day. */
  points: number;
  /** Cumulative value shipped by the end of that day. */
  valueShipped: number;
  morale: number;
  trust: number;
}

export interface GameState {
  seed: string;
  rngState: number;
  /** 1-based day currently being planned (or just played, during an event). */
  day: number;
  phase: Phase;
  morale: number;
  trust: number;
  tickets: Ticket[];
  assignments: Record<DevId, string | null>;
  crunch: boolean;
  /** Devs who are out today / tomorrow. */
  out: DevId[];
  outTomorrow: DevId[];
  /** Devs who quit. They don't come back. */
  gone: DevId[];
  /** Why each dev was last out, for the team panel. */
  outReason: Partial<Record<DevId, string>>;
  /** Points everyone gains or loses per day, today / tomorrow. */
  pace: number;
  paceTomorrow: number;
  /** Permanent extra points per day a dev has earned. */
  bonus: Partial<Record<DevId, number>>;
  /** Which event fires after which day. */
  schedule: Partial<Record<number, EventId>>;
  /** Accidents that can happen in this game when the plan invites them. */
  hazards: EventId[];
  pendingEvent: PendingEvent | null;
  /** Events still to resolve tonight, after the pending one. */
  queue: EventId[];
  /** Unused events, drawn on when a scheduled one can't happen. */
  spare: EventId[];
  /** Times the player declined or traded scope. */
  saidNo: number;
  log: LogEntry[];
  history: DayRecord[];
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface Scorecard {
  /** Launched: every must-have shipped and nobody walked away. */
  won: boolean;
  /** One line that says, unmistakably, how it ended. */
  headline: string;
  score: number;
  grade: Grade;
  title: string;
  blurb: string;
  valueShipped: number;
  shipped: number;
  total: number;
  missedMustHaves: number;
  morale: number;
  trust: number;
}
