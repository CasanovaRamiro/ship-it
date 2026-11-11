import { AI_TICKET, DAYS, DEVS, DEV_ORDER, HOTFIX_TICKET } from './content';
import { adjust, isOpen, note } from './helpers';
import type { Rng } from './rng';
import type { EventId, GameState, PendingEvent, Ticket } from './types';

export interface Choice {
  label: string;
  /** The consequence, shown up front: the game is about trade-offs, not gotchas. */
  hint: string;
  apply(state: GameState): GameState;
}

interface EventDef {
  title: string;
  /** Roll whatever the event needs. Null means it can't happen right now. */
  setup(state: GameState, rng: Rng): PendingEvent | null;
  body(state: GameState, ev: PendingEvent): string;
  choices(state: GameState, ev: PendingEvent): Choice[];
}

const shippedCount = (s: GameState) => s.tickets.filter((t) => !isOpen(t)).length;

/** The cheapest thing to give up: lowest-value ticket nobody has touched. */
function swapCandidate(state: GameState): Ticket | undefined {
  return state.tickets
    .filter((t) => isOpen(t) && t.progress === 0 && !t.mustHave && t.dueDay === null)
    .sort((a, b) => a.value - b.value)[0];
}

const withTicket = (s: GameState, t: Ticket): GameState => ({ ...s, tickets: [...s.tickets, { ...t }] });

export const EVENTS: Record<EventId, EventDef> = {
  'scope-creep': {
    title: 'Scope creep',
    setup: () => ({ id: 'scope-creep' }),
    body: () => 'The CEO saw a competitor’s demo. “Can we squeeze AI summaries into this sprint?”',
    choices: (state) => {
      const swap = swapCandidate(state);
      const choices: Choice[] = [
        {
          label: 'Sure, we’ll fit it in',
          hint: `Adds AI summaries (${AI_TICKET.effort} pts) · trust +8`,
          apply: (s) => note(adjust(withTicket(s, AI_TICKET), { trust: 8 }), 'You took on AI summaries.'),
        },
      ];
      if (swap) {
        choices.push({
          label: `Only if ${swap.title} comes out`,
          hint: 'Trades scope for scope · trust +3',
          apply: (s) =>
            note(
              adjust(
                { ...s, tickets: [...s.tickets.filter((t) => t.id !== swap.id), { ...AI_TICKET }], saidNo: s.saidNo + 1 },
                { trust: 3 },
              ),
              `You traded ${swap.title} for AI summaries.`,
              'good',
            ),
        });
      }
      choices.push({
        label: 'Not this sprint',
        hint: 'Trust −8',
        apply: (s) => note(adjust({ ...s, saidNo: s.saidNo + 1 }, { trust: -8 }), 'You pushed AI summaries to next sprint.'),
      });
      return choices;
    },
  },

  incident: {
    title: 'Production incident',
    setup: () => ({ id: 'incident' }),
    body: () => 'Checkout is throwing errors in production. Support is getting loud.',
    choices: (state) => {
      const due = Math.min(DAYS, state.day + 2);
      return [
        {
          label: 'Triage it now',
          hint: `Adds a hotfix (${HOTFIX_TICKET.effort} pts) due by the end of day ${due}`,
          apply: (s) => note(withTicket(s, { ...HOTFIX_TICKET, dueDay: due }), `Hotfix opened, due day ${due}.`, 'bad'),
        },
        {
          label: 'It can wait until after the sprint',
          hint: 'Trust −15',
          apply: (s) => note(adjust(s, { trust: -15 }), 'You left checkout broken. Customers noticed.', 'bad'),
        },
      ];
    },
  },

  sick: {
    title: 'Sick day',
    setup: (_state, rng) => ({ id: 'sick', devId: rng.pick(DEV_ORDER) }),
    body: (_state, ev) => `${DEVS[ev.devId!].name} wakes up with a fever.`,
    choices: (_state, ev) => {
      const dev = DEVS[ev.devId!];
      return [
        {
          label: 'Rest up, we’ll manage',
          hint: `${dev.name} is out tomorrow`,
          apply: (s) => note({ ...s, outTomorrow: [...s.outTomorrow, dev.id] }, `${dev.name} took a sick day.`),
        },
        {
          label: 'Could you still hop on?',
          hint: 'Morale −12',
          apply: (s) => note(adjust(s, { morale: -12 }), `${dev.name} worked through a fever. The team noticed.`, 'bad'),
        },
      ];
    },
  },

  underestimated: {
    title: 'Bad estimate',
    setup: (state, rng) => {
      const candidates = state.tickets.filter((t) => isOpen(t) && t.dueDay === null);
      return candidates.length ? { id: 'underestimated', ticketId: rng.pick(candidates).id } : null;
    },
    body: (state, ev) => {
      const t = state.tickets.find((x) => x.id === ev.ticketId)!;
      return `${t.title} is hairier than anyone estimated. It needs 4 more points.`;
    },
    choices: (state, ev) => {
      const t = state.tickets.find((x) => x.id === ev.ticketId)!;
      const cut = Math.max(1, t.value - 3);
      const patch = (s: GameState, p: Partial<Ticket>): GameState => ({
        ...s,
        tickets: s.tickets.map((x) => (x.id === t.id ? { ...x, ...p } : x)),
      });
      return [
        {
          label: 'Absorb it',
          hint: `${t.title}: ${t.effort} → ${t.effort + 4} pts`,
          apply: (s) => note(patch(s, { effort: t.effort + 4 }), `${t.title} grew by 4 points.`, 'bad'),
        },
        {
          label: 'Ship a simpler version',
          hint: `Same effort · value ${t.value} → ${cut}`,
          apply: (s) => note(patch(s, { value: cut }), `You cut ${t.title} down to a simpler version.`),
        },
      ];
    },
  },

  lunch: {
    title: 'Team lunch',
    setup: () => ({ id: 'lunch' }),
    body: () => 'It’s Bo’s birthday tomorrow and the team wants a long lunch out.',
    choices: () => [
      {
        label: 'Go, enjoy it',
        hint: 'Morale +12 · everyone works 1 pt slower tomorrow',
        apply: (s) => note(adjust({ ...s, slowTomorrow: true }, { morale: 12 }), 'Long lunch booked for tomorrow.', 'good'),
      },
      {
        label: 'After the sprint',
        hint: 'Morale −6',
        apply: (s) => note(adjust(s, { morale: -6 }), 'Birthday lunch postponed.', 'bad'),
      },
    ],
  },

  'status-call': {
    title: 'Status call',
    setup: () => ({ id: 'status-call' }),
    body: () => 'The VP wants a daily one-hour status call with the whole team.',
    choices: () => [
      {
        label: 'Fine, book it',
        hint: 'Trust +8 · morale −10',
        apply: (s) => note(adjust(s, { trust: 8, morale: -10 }), 'Daily status call added to everyone’s calendar.', 'bad'),
      },
      {
        label: 'I’ll send a written update instead',
        hint: 'Trust +2',
        apply: (s) => note(adjust({ ...s, saidNo: s.saidNo + 1 }, { trust: 2 }), 'You shielded the team with a written update.', 'good'),
      },
      {
        label: 'No',
        hint: 'Trust −6 · morale +3',
        apply: (s) => note(adjust({ ...s, saidNo: s.saidNo + 1 }, { trust: -6, morale: 3 }), 'You declined the status call.'),
      },
    ],
  },

  demo: {
    title: 'Mid-sprint demo',
    setup: () => ({ id: 'demo' }),
    body: (state) => {
      const n = shippedCount(state);
      const have = n === 0 ? 'nothing finished' : n === 1 ? 'one finished ticket' : `${n} finished tickets`;
      return `The client drops by to see progress. You have ${have} to show.`;
    },
    choices: (state) => {
      const n = shippedCount(state);
      const trust = n >= 2 ? 12 : n === 1 ? 4 : -12;
      return [
        {
          label: n === 0 ? 'Show them some half-built screens' : 'Show them what shipped',
          hint: `Trust ${trust > 0 ? '+' : '−'}${Math.abs(trust)}`,
          apply: (s) =>
            note(
              adjust(s, { trust }),
              n === 0 ? 'The demo had nothing finished in it.' : 'The demo landed well.',
              trust > 0 ? 'good' : 'bad',
            ),
        },
      ];
    },
  },
};

export const OPTIONAL_EVENTS: EventId[] = ['scope-creep', 'incident', 'sick', 'underestimated', 'lunch', 'status-call'];
