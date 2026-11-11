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
  /** Business value, counted only once the ticket ships. */
  value: number;
  mustHave: boolean;
  /** Hotfixes must ship by the end of this day. */
  dueDay: number | null;
  shippedDay: number | null;
}

export type Phase = 'planning' | 'event' | 'over';

export type EventId =
  | 'scope-creep'
  | 'incident'
  | 'sick'
  | 'underestimated'
  | 'lunch'
  | 'status-call'
  | 'demo';

/** An event waiting on the player, with whatever it rolled when it fired. */
export interface PendingEvent {
  id: EventId;
  devId?: DevId;
  ticketId?: string;
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
  /** Everyone works one point slower today / tomorrow. */
  slow: boolean;
  slowTomorrow: boolean;
  /** Which event fires after which day. */
  schedule: Partial<Record<number, EventId>>;
  pendingEvent: PendingEvent | null;
  /** Times the player declined or traded scope. */
  saidNo: number;
  log: LogEntry[];
  history: DayRecord[];
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface Scorecard {
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
