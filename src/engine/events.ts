import { DAYS, DEVS, DEV_ORDER, LOW_MORALE, isFriday, makeTicket, weekOf } from './content';
import { adjust, crewOf, isOpen, note, outputOf, remaining, ticketOf } from './helpers';
import type { Rng } from './rng';
import type { DevId, EventId, GameState, PendingEvent, Ticket } from './types';

export interface Choice {
  label: string;
  /** The consequence, shown up front: the game is about trade-offs, not gotchas. */
  hint: string;
  apply(state: GameState): GameState;
}

interface EventDef {
  title: string;
  /**
   * Roll whatever the event needs. Null means it can't happen right now.
   * `plan` is the state the day started with, before work landed.
   */
  setup(state: GameState, rng: Rng, plan: GameState): PendingEvent | null;
  body(state: GameState, ev: PendingEvent): string;
  choices(state: GameState, ev: PendingEvent): Choice[];
}

/* ---------- small building blocks ---------- */

const find = (s: GameState, id: string | undefined) => s.tickets.find((t) => t.id === id)!;
const scoped = (s: GameState) => s.tickets.filter((t) => isOpen(t) && t.dueDay === null);
/** Who will be at work tomorrow. */
const here = (s: GameState, devs: readonly DevId[] = DEV_ORDER) => devs.filter((d) => !s.outTomorrow.includes(d) && !s.gone.includes(d));
const around = (s: GameState, d: DevId) => !s.gone.includes(d);

const patch = (s: GameState, id: string, p: (t: Ticket) => Partial<Ticket>): GameState => ({
  ...s,
  tickets: s.tickets.map((t) => (t.id === id ? { ...t, ...p(t) } : t)),
});

const withTicket = (s: GameState, t: Ticket): GameState => ({
  ...s,
  tickets: [...s.tickets, { ...t, week: weekOf(s.day) }],
});

const sendOut = (s: GameState, devId: DevId, reason: string): GameState => ({
  ...s,
  outTomorrow: [...s.outTomorrow.filter((d) => d !== devId), devId],
  outReason: { ...s.outReason, [devId]: reason },
});

const pace = (s: GameState, n: number): GameState => ({ ...s, paceTomorrow: s.paceTomorrow + n });
const saidNo = (s: GameState): GameState => ({ ...s, saidNo: s.saidNo + 1 });
const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;

/** The cheapest thing to give up: lowest-value ticket nobody has touched. */
function swapCandidate(state: GameState): Ticket | undefined {
  return scoped(state)
    .filter((t) => t.progress === 0 && !t.mustHave)
    .sort((a, b) => a.value - b.value)[0];
}

/** Someone important wants one more thing in the sprint. */
function scopeAsk(title: string, body: string, ask: Ticket): EventDef {
  return {
    title,
    setup: (state) => (state.tickets.some((t) => t.id === ask.id) ? null : { id: '' }),
    body: () => body,
    choices: (state) => {
      const swap = swapCandidate(state);
      const choices: Choice[] = [
        {
          label: 'Sure, we’ll fit it in',
          hint: `Adds ${ask.title} (${ask.effort} pts) · trust +6`,
          apply: (s) => note(adjust(withTicket(s, ask), { trust: 6 }), `You took on ${ask.title}.`),
        },
      ];
      if (swap) {
        choices.push({
          label: `Only if ${swap.title} comes out`,
          hint: 'Trades scope for scope · trust +2',
          apply: (s) =>
            note(
              adjust(saidNo(withTicket({ ...s, tickets: s.tickets.filter((t) => t.id !== swap.id) }, ask)), { trust: 2 }),
              `You traded ${swap.title} for ${ask.title}.`,
              'good',
            ),
        });
      }
      choices.push({
        label: 'Not now',
        hint: 'Trust −12',
        apply: (s) => note(adjust(saidNo(s), { trust: -12 }), `You pushed ${ask.title} to “later”.`),
      });
      return choices;
    },
  };
}

/** Something is on fire and comes with a deadline. */
function fire(title: string, body: string, fix: Ticket, ignore: { label: string; trust: number; log: string }): EventDef {
  return {
    title,
    setup: (state) => (state.tickets.some((t) => t.id === fix.id) ? null : { id: '' }),
    body: () => body,
    choices: (state) => {
      const due = Math.min(DAYS, state.day + 2);
      return [
        {
          label: 'Fix it now',
          hint: `Adds an urgent fix (${fix.effort} pts) due by the end of day ${due}`,
          apply: (s) => note(withTicket(s, { ...fix, dueDay: due }), `${fix.title}: due day ${due}.`, 'bad'),
        },
        {
          label: ignore.label,
          hint: `Trust ${signed(ignore.trust)}`,
          apply: (s) => note(adjust(s, { trust: ignore.trust }), ignore.log, 'bad'),
        },
      ];
    },
  };
}

const IDLE_PROJECTS = [
  'built a Slack bot that rates pull requests with emoji',
  'rewrote the README as a sea shanty',
  'added a Konami code to the login page',
  'reorganised the whole repo into “better” folders',
];

/* ---------- the events ---------- */

export const EVENTS: Record<EventId, EventDef> = {
  /* Asks */

  'scope-creep': scopeAsk(
    'Scope creep',
    'The CEO saw a competitor’s demo. “Can we squeeze in AI summaries?”',
    makeTicket({ id: 'ai', title: 'AI summaries', kind: 'be', effort: 8, value: 8 }),
  ),

  'sales-promise': scopeAsk(
    'Sales promised something',
    'Sales closed a deal by promising single sign-on. They mention it to you in the hallway.',
    makeTicket({ id: 'sso', title: 'Single sign-on', kind: 'fe', effort: 6, value: 7 }),
  ),

  'big-customer': {
    title: 'Loud customer',
    setup: (state, rng) => {
      const candidates = scoped(state).filter((t) => !t.mustHave);
      return candidates.length ? { id: 'big-customer', ticketId: rng.pick(candidates).id } : null;
    },
    body: (state, ev) => `Your biggest customer says they’ll walk unless ${find(state, ev.ticketId).title} is in the launch.`,
    choices: (state, ev) => {
      const t = find(state, ev.ticketId);
      return [
        {
          label: 'Promise it',
          hint: `${t.title} becomes a must-have · trust +8`,
          apply: (s) => note(adjust(patch(s, t.id, () => ({ mustHave: true })), { trust: 8 }), `${t.title} is now a must-have.`, 'bad'),
        },
        {
          label: '“We’ll see what we can do”',
          hint: 'Trust −12',
          apply: (s) => note(adjust(saidNo(s), { trust: -12 }), 'You made the big customer no promises.'),
        },
      ];
    },
  },

  logo: {
    title: 'Make the logo bigger',
    setup: (state, rng) => {
      const candidates = scoped(state).filter((t) => t.kind === 'fe');
      return candidates.length ? { id: 'logo', ticketId: rng.pick(candidates).id } : null;
    },
    body: (state, ev) => `Marketing has feedback on ${find(state, ev.ticketId).title}: “Can the logo be bigger? And can it pop more?”`,
    choices: (state, ev) => {
      const t = find(state, ev.ticketId);
      return [
        {
          label: 'Make it pop',
          hint: `${t.title} +2 pts · trust +4`,
          apply: (s) => note(adjust(patch(s, t.id, (x) => ({ effort: x.effort + 2 })), { trust: 4 }), 'The logo is bigger. It pops.'),
        },
        {
          label: 'The logo is fine',
          hint: 'Trust −8',
          apply: (s) => note(adjust(saidNo(s), { trust: -8 }), 'The logo stayed the same size.'),
        },
      ];
    },
  },

  'status-call': {
    title: 'Status call',
    setup: () => ({ id: 'status-call' }),
    body: () => 'The VP wants a daily one-hour status call with the whole team.',
    choices: () => [
      {
        label: 'Fine, book it',
        hint: 'Trust +6 · morale −15',
        apply: (s) => note(adjust(s, { trust: 6, morale: -15 }), 'Daily status call added to everyone’s calendar.', 'bad'),
      },
      {
        label: 'I’ll send a written update instead',
        hint: 'Trust +2',
        apply: (s) => note(adjust(saidNo(s), { trust: 2 }), 'You shielded the team with a written update.', 'good'),
      },
      {
        label: 'No',
        hint: 'Trust −9 · morale +3',
        apply: (s) => note(adjust(saidNo(s), { trust: -9, morale: 3 }), 'You declined the status call.'),
      },
    ],
  },

  'all-hands': {
    title: 'Mandatory fun',
    setup: () => ({ id: 'all-hands' }),
    body: () => 'Tomorrow is the company all-hands: three hours of slides, then trust falls.',
    choices: (state) => [
      {
        label: 'We’ll all be there',
        hint: 'Trust +4 · everyone works 1 pt slower tomorrow',
        apply: (s) => note(adjust(pace(s, -1), { trust: 4 }), 'The whole team is at the all-hands tomorrow.'),
      },
      ...(here(state).includes('cy')
        ? [
            {
        label: 'Send Cy to take notes',
        hint: 'Cy is out tomorrow · trust +1',
        apply: (s: GameState) => note(adjust(sendOut(s, 'cy', 'At the all-hands'), { trust: 1 }), 'Cy drew the short straw for the all-hands.'),
            },
          ]
        : []),
      {
        label: 'We’re busy shipping',
        hint: 'Trust −9 · morale +4',
        apply: (s) => note(adjust(saidNo(s), { trust: -9, morale: 4 }), 'The team skipped the all-hands.'),
      },
    ],
  },

  nephew: {
    title: 'The CEO’s nephew',
    setup: () => ({ id: 'nephew' }),
    body: () => 'The CEO’s nephew wants to shadow the team tomorrow. He has “a lot of ideas about apps”.',
    choices: () => [
      {
        label: 'He’s welcome',
        hint: 'Trust +6 · everyone works 1 pt slower tomorrow',
        apply: (s) => note(adjust(pace(s, -1), { trust: 6 }), 'The CEO’s nephew is shadowing the team tomorrow.'),
      },
      {
        label: 'Give him a tour of the kitchen instead',
        hint: 'Trust −8',
        apply: (s) => note(adjust(saidNo(s), { trust: -8 }), 'The nephew got a very thorough tour of the kitchen.'),
      },
    ],
  },

  /* Fires */

  incident: fire(
    'Production incident',
    'Checkout is throwing errors in production. Support is getting loud.',
    makeTicket({ id: 'hotfix', title: 'Hotfix: checkout is down', kind: 'be', effort: 4, value: 0 }),
    { label: 'It can wait', trust: -22, log: 'You left checkout broken. Customers noticed.' },
  ),

  'security-audit': fire(
    'Security audit',
    'The auditor found that the admin password is “admin”. They would like a word.',
    makeTicket({ id: 'secrets', title: 'Rotate every secret', kind: 'be', effort: 3, value: 0 }),
    { label: 'Change it to “admin1”', trust: -18, log: 'The admin password is now “admin1”. The auditor wept.' },
  ),

  'ci-red': {
    title: 'CI is red',
    setup: (state) => (here(state).includes('ada') ? { id: 'ci-red' } : null),
    body: () => 'The build has been red all afternoon. The error is “exit code 1” and nothing else.',
    choices: () => [
      {
        label: 'Ada digs into the pipeline',
        hint: 'Ada is busy tomorrow',
        apply: (s) => note(sendOut(s, 'ada', 'Fixing CI'), 'Ada is spending tomorrow fixing the pipeline.'),
      },
      {
        label: 'Merge anyway, it’s probably flaky',
        hint: 'Trust −10',
        apply: (s) => note(adjust(s, { trust: -10 }), 'You merged on red. It was not flaky.', 'bad'),
      },
    ],
  },

  /* People */

  sick: {
    title: 'Sick day',
    setup: (state, rng) => {
      const devs = here(state);
      return devs.length ? { id: 'sick', devId: rng.pick(devs) } : null;
    },
    body: (_state, ev) => `${DEVS[ev.devId!].name} wakes up with a fever.`,
    choices: (_state, ev) => {
      const dev = DEVS[ev.devId!];
      return [
        {
          label: 'Rest up, we’ll manage',
          hint: `${dev.name} is out tomorrow`,
          apply: (s) => note(sendOut(s, dev.id, 'Out sick'), `${dev.name} took a sick day.`),
        },
        {
          label: 'Could you still hop on?',
          hint: 'Morale −18',
          apply: (s) => note(adjust(s, { morale: -18 }), `${dev.name} worked through a fever. The team noticed.`, 'bad'),
        },
      ];
    },
  },

  conference: {
    title: 'Speaker slot',
    setup: (state, rng) => {
      const devs = here(state, ['ada', 'bo']);
      return devs.length ? { id: 'conference', devId: rng.pick(devs) } : null;
    },
    body: (_state, ev) => `A speaker dropped out of tomorrow’s conference and ${DEVS[ev.devId!].name} was offered the slot.`,
    choices: (_state, ev) => {
      const dev = DEVS[ev.devId!];
      return [
        {
          label: 'Go, make us look good',
          hint: `${dev.name} is out tomorrow · morale +10`,
          apply: (s) => note(adjust(sendOut(s, dev.id, 'At a conference'), { morale: 10 }), `${dev.name} is giving a talk tomorrow.`, 'good'),
        },
        {
          label: 'Bad timing, sorry',
          hint: 'Morale −9',
          apply: (s) => note(adjust(s, { morale: -9 }), `${dev.name} turned down the talk.`, 'bad'),
        },
      ];
    },
  },

  laptop: {
    title: 'Laptop down',
    setup: (state, rng) => {
      const devs = here(state);
      return devs.length ? { id: 'laptop', devId: rng.pick(devs) } : null;
    },
    body: (_state, ev) => `${DEVS[ev.devId!].name}’s laptop met a full cup of coffee. The laptop lost.`,
    choices: (_state, ev) => {
      const dev = DEVS[ev.devId!];
      return [
        {
          label: 'Buy a new one on the company card',
          hint: 'Trust −8',
          apply: (s) => note(adjust(s, { trust: -8 }), `You expensed a new laptop for ${dev.name}. Finance has questions.`),
        },
        {
          label: 'IT says they’ll have a loaner “soon”',
          hint: `${dev.name} is out tomorrow`,
          apply: (s) => note(sendOut(s, dev.id, 'Waiting on IT'), `${dev.name} is waiting on IT for a laptop.`),
        },
      ];
    },
  },

  mentoring: {
    title: 'Mentoring',
    setup: (state) => (!state.bonus.cy && around(state, 'cy') && here(state).includes('ada') ? { id: 'mentoring' } : null),
    body: () => 'Cy asks whether Ada could spend tomorrow walking them through how the system actually works.',
    choices: () => [
      {
        label: 'Good idea',
        hint: 'Ada is busy tomorrow · Cy works 1 pt faster from then on',
        apply: (s) =>
          note(
            { ...sendOut(s, 'ada', 'Mentoring Cy'), bonus: { ...s.bonus, cy: (s.bonus.cy ?? 0) + 1 } },
            'Ada is mentoring Cy tomorrow.',
            'good',
          ),
      },
      {
        label: 'After the launch',
        hint: 'Morale −8',
        apply: (s) => note(adjust(s, { morale: -8 }), 'Cy’s mentoring was postponed.', 'bad'),
      },
    ],
  },

  'reply-all': {
    title: 'Reply all',
    setup: (state) => (around(state, 'cy') ? { id: 'reply-all' } : null),
    body: () => 'Cy replied-all to the entire company. The message reads: “who even is this guy?” It was about the CEO.',
    choices: () => [
      {
        label: 'Frame it and hang it in the team area',
        hint: 'Morale +7 · trust −6',
        apply: (s) => note(adjust(s, { morale: 7, trust: -6 }), 'Cy’s email is now framed above the printer.', 'good'),
      },
      {
        label: 'Have Cy write an apology',
        hint: 'Trust +2 · morale −8',
        apply: (s) => note(adjust(s, { trust: 2, morale: -8 }), 'Cy sent a very long apology. Also reply-all.'),
      },
    ],
  },

  /* Office life */

  lunch: {
    title: 'Team lunch',
    setup: (state) => (around(state, 'bo') ? { id: 'lunch' } : null),
    body: () => 'It’s Bo’s birthday tomorrow and the team wants a long lunch out.',
    choices: () => [
      {
        label: 'Go, enjoy it',
        hint: 'Morale +12 · everyone works 1 pt slower tomorrow',
        apply: (s) => note(adjust(pace(s, -1), { morale: 12 }), 'Long lunch booked for tomorrow.', 'good'),
      },
      {
        label: 'After the launch',
        hint: 'Morale −9',
        apply: (s) => note(adjust(s, { morale: -9 }), 'Birthday lunch postponed.', 'bad'),
      },
    ],
  },

  coffee: {
    title: 'Coffee machine',
    setup: () => ({ id: 'coffee' }),
    body: () => 'The coffee machine made a noise like a modem and died mid-standup.',
    choices: () => [
      {
        label: 'Order a fancy new one today',
        hint: 'Morale +6 · trust −6',
        apply: (s) => note(adjust(s, { morale: 6, trust: -6 }), 'A very expensive espresso machine is on its way.', 'good'),
      },
      {
        label: 'There’s instant in the cupboard',
        hint: 'Morale −5 · everyone works 1 pt slower tomorrow',
        apply: (s) => note(adjust(pace(s, -1), { morale: -5 }), 'The team is running on instant coffee.', 'bad'),
      },
    ],
  },

  wifi: {
    title: 'Wifi outage',
    setup: () => ({ id: 'wifi' }),
    body: () => 'Someone unplugged the router to charge a scooter. The office is offline until tomorrow evening.',
    choices: () => [
      {
        label: 'Work from the café downstairs',
        hint: 'Morale +4 · everyone works 1 pt slower tomorrow',
        apply: (s) => note(adjust(pace(s, -1), { morale: 4 }), 'Tomorrow the team works from the café.'),
      },
      {
        label: 'Mobile hotspots for everyone, expensed',
        hint: 'Trust −8',
        apply: (s) => note(adjust(s, { trust: -8 }), 'You expensed three mobile hotspots.'),
      },
    ],
  },

  pizza: {
    title: 'Free pizza',
    setup: () => ({ id: 'pizza' }),
    body: () => 'A vendor sent twelve pizzas and a crate of energy drinks. Nobody knows which vendor.',
    choices: () => [
      {
        label: 'Late-night hack session',
        hint: 'Everyone works 1 pt faster tomorrow · morale −9',
        apply: (s) => note(adjust(pace(s, 1), { morale: -9 }), 'The team hacked late on mystery pizza.'),
      },
      {
        label: 'Just eat the pizza',
        hint: 'Morale +5',
        apply: (s) => note(adjust(s, { morale: 5 }), 'The pizza was eaten in peace.', 'good'),
      },
    ],
  },

  'office-dog': {
    title: 'Office dog',
    setup: (state, rng) => {
      const candidates = scoped(state).filter((t) => t.progress >= 2);
      return candidates.length && around(state, 'bo') && around(state, 'ada') ? { id: 'office-dog', ticketId: rng.pick(candidates).id } : null;
    },
    body: () => 'Bo brought their dog in. It is very good, and it is currently asleep on Ada’s keyboard.',
    choices: (state, ev) => {
      const t = find(state, ev.ticketId);
      return [
        {
          label: 'The dog stays',
          hint: `Morale +9 · ${t.title} loses 2 pts to paw-typed commits`,
          apply: (s) =>
            note(adjust(patch(s, t.id, (x) => ({ progress: x.progress - 2 })), { morale: 9 }), `The dog committed to ${t.title}.`, 'good'),
        },
        {
          label: 'The dog goes home',
          hint: 'Morale −8',
          apply: (s) => note(adjust(s, { morale: -8 }), 'The dog went home. So did the mood.', 'bad'),
        },
      ];
    },
  },

  /* The work itself */

  underestimated: {
    title: 'Bad estimate',
    setup: (state, rng) => {
      const candidates = scoped(state);
      return candidates.length ? { id: 'underestimated', ticketId: rng.pick(candidates).id } : null;
    },
    body: (state, ev) => `${find(state, ev.ticketId).title} is hairier than anyone estimated. It needs 4 more points.`,
    choices: (state, ev) => {
      const t = find(state, ev.ticketId);
      const cut = Math.max(1, t.value - 3);
      return [
        {
          label: 'Absorb it',
          hint: `${t.title}: ${t.effort} → ${t.effort + 4} pts`,
          apply: (s) => note(patch(s, t.id, (x) => ({ effort: x.effort + 4 })), `${t.title} grew by 4 points.`, 'bad'),
        },
        {
          label: 'Ship a simpler version',
          hint: `Same effort · value ${t.value} → ${cut}`,
          apply: (s) => note(patch(s, t.id, () => ({ value: cut })), `You cut ${t.title} down to a simpler version.`),
        },
      ];
    },
  },

  'easy-win': {
    title: 'Good estimate, for once',
    setup: (state, rng) => {
      const candidates = scoped(state).filter((t) => remaining(t) >= 4);
      return candidates.length ? { id: 'easy-win', ticketId: rng.pick(candidates).id } : null;
    },
    body: (state, ev) => `${find(state, ev.ticketId).title} turns out to be easier than anyone thought. Nobody trusts it.`,
    choices: (state, ev) => {
      const t = find(state, ev.ticketId);
      return [
        {
          label: 'Bank the time',
          hint: `${t.title}: ${t.effort} → ${t.effort - 3} pts`,
          apply: (s) => note(patch(s, t.id, (x) => ({ effort: x.effort - 3 })), `${t.title} got 3 points cheaper.`, 'good'),
        },
        {
          label: 'Use the slack to polish it',
          hint: `Same effort · value ${t.value} → ${t.value + 2}`,
          apply: (s) => note(patch(s, t.id, (x) => ({ value: x.value + 2 })), `${t.title} will ship with extra polish.`, 'good'),
        },
      ];
    },
  },

  library: {
    title: 'There’s a library for that',
    setup: (state, rng) => {
      const candidates = scoped(state).filter((t) => remaining(t) >= 5);
      return candidates.length && around(state, 'bo') ? { id: 'library', ticketId: rng.pick(candidates).id } : null;
    },
    body: (state, ev) =>
      `Bo found an open-source library that does half of ${find(state, ev.ticketId).title}. It has 40 stars and one maintainer, last seen in 2019.`,
    choices: (state, ev) => {
      const t = find(state, ev.ticketId);
      return [
        {
          label: 'npm install and don’t look back',
          hint: `${t.title}: ${t.effort} → ${t.effort - 4} pts · trust −5`,
          apply: (s) => note(adjust(patch(s, t.id, (x) => ({ effort: x.effort - 4 })), { trust: -5 }), `${t.title} now depends on a stranger.`),
        },
        {
          label: 'We’ll write our own',
          hint: 'Morale +3',
          apply: (s) => note(adjust(s, { morale: 3 }), 'The team wrote it themselves, with pride.'),
        },
      ];
    },
  },

  'tech-debt': {
    title: 'Tech debt',
    setup: (state) => {
      const be = scoped(state).filter((t) => t.kind === 'be' && remaining(t) >= 3);
      return be.length >= 2 && here(state).includes('ada') ? { id: 'tech-debt' } : null;
    },
    body: () => 'Ada wants a day to rip out the old ORM. “Everything on the backend gets easier after this. Trust me.”',
    choices: () => [
      {
        label: 'Do it',
        hint: 'Ada is busy tomorrow · every open backend ticket gets 2 pts cheaper',
        apply: (s) =>
          note(
            {
              ...sendOut(s, 'ada', 'Paying down tech debt'),
              tickets: s.tickets.map((t) =>
                isOpen(t) && t.kind === 'be' && t.dueDay === null && remaining(t) >= 3 ? { ...t, effort: t.effort - 2 } : t,
              ),
            },
            'Ada is paying down tech debt tomorrow.',
            'good',
          ),
      },
      {
        label: 'After the launch',
        hint: 'Morale −8',
        apply: (s) => note(adjust(s, { morale: -8 }), 'The old ORM lives on. Ada sighed audibly.', 'bad'),
      },
    ],
  },

  'ai-assistant': {
    title: 'AI pair programmer',
    setup: (state, rng) => {
      const candidates = scoped(state);
      return candidates.length ? { id: 'ai-assistant', ticketId: rng.pick(candidates).id } : null;
    },
    body: () => 'The CEO bought everyone an AI coding assistant and would love to hear how much faster you are now.',
    choices: (state, ev) => {
      const t = find(state, ev.ticketId);
      return [
        {
          label: 'Roll it out',
          hint: `Trust +3 · everyone works 1 pt faster tomorrow · ${t.title} +3 pts of confident nonsense to clean up`,
          apply: (s) =>
            note(adjust(pace(patch(s, t.id, (x) => ({ effort: x.effort + 3 })), 1), { trust: 3 }), `The AI “helped” with ${t.title}.`),
        },
        {
          label: 'We’ll evaluate it after the launch',
          hint: 'Trust −6',
          apply: (s) => note(adjust(saidNo(s), { trust: -6 }), 'The AI assistant licences sit unused.'),
        },
      ];
    },
  },

  /* Accidents: see HAZARDS below. These only fire when the day's plan invites them. */

  'db-wipe': {
    title: 'Cy dropped the database',
    setup: (state) => (here(state).includes('ada') ? { id: 'db-wipe' } : null),
    body: () => 'Working alone, Cy ran a migration against what they were sure was staging. The production users table is gone.',
    choices: () => [
      {
        label: 'Ada restores it from backups',
        hint: 'Ada is busy tomorrow · trust −5',
        apply: (s) => note(adjust(sendOut(s, 'ada', 'Restoring the database'), { trust: -5 }), 'Ada is restoring production tomorrow.', 'bad'),
      },
      {
        label: 'Cy cleans up their own mess, slowly',
        hint: 'Trust −18',
        apply: (s) => note(adjust(s, { trust: -18 }), 'Production was down most of a day while Cy found the backups.', 'bad'),
      },
    ],
  },

  'merge-hell': {
    title: 'Too many cooks',
    setup: (state, _rng, plan) => {
      const t = state.tickets.find((x) => x.id === plan.assignments.ada);
      return t && isOpen(t) && t.progress >= 3 ? { id: 'merge-hell', ticketId: t.id } : null;
    },
    body: (state, ev) => `All three of them edited the same file in ${find(state, ev.ticketId).title}. The merge conflict is 900 lines long.`,
    choices: (state, ev) => {
      const t = find(state, ev.ticketId);
      return [
        {
          label: 'Untangle it together',
          hint: 'Everyone works 1 pt slower tomorrow',
          apply: (s) => note(pace(s, -1), 'The team is untangling a merge conflict tomorrow.', 'bad'),
        },
        {
          label: 'Keep Ada’s version, redo the rest',
          hint: `${t.title} loses 3 pts`,
          apply: (s) => note(patch(s, t.id, (x) => ({ progress: x.progress - 3 })), `${t.title} lost 3 points to a merge conflict.`, 'bad'),
        },
      ];
    },
  },

  'idle-hands': {
    title: 'Idle hands',
    setup: (_state, rng, plan) => {
      const idle = DEV_ORDER.filter((d) => !plan.out.includes(d) && !ticketOf(plan, d));
      return idle.length ? { id: 'idle-hands', devId: rng.pick(idle), variant: rng.int(IDLE_PROJECTS.length) } : null;
    },
    body: (_state, ev) => `${DEVS[ev.devId!].name} had nothing to do today and ${IDLE_PROJECTS[ev.variant!]}.`,
    choices: (_state, ev) => {
      const dev = DEVS[ev.devId!];
      return [
        {
          label: 'Love it. Show the whole company',
          hint: 'Morale +6 · trust −6',
          apply: (s) => note(adjust(s, { morale: 6, trust: -6 }), `${dev.name}’s side project went company-wide.`, 'good'),
        },
        {
          label: 'Please never do that again',
          hint: 'Morale −6',
          apply: (s) => note(adjust(s, { morale: -6 }), `${dev.name}’s side project was quietly reverted.`),
        },
      ];
    },
  },

  recruiter: {
    title: 'A “dentist appointment”',
    setup: (state, rng) => {
      const devs = here(state);
      return devs.length ? { id: 'recruiter', devId: rng.pick(devs) } : null;
    },
    body: (_state, ev) =>
      `${DEVS[ev.devId!].name} came back from a “dentist appointment” wearing a blazer. Nobody wears a blazer to the dentist.`,
    choices: (_state, ev) => {
      const dev = DEVS[ev.devId!];
      return [
        {
          label: 'Give them tomorrow off, no questions',
          hint: `${dev.name} is out tomorrow · morale +10`,
          apply: (s) => note(adjust(sendOut(s, dev.id, 'Taking a day off'), { morale: 10 }), `${dev.name} got a day off to think.`),
        },
        {
          label: 'Tell the client the pace has to drop',
          hint: 'Morale +6 · trust −9',
          apply: (s) => note(adjust(s, { morale: 6, trust: -9 }), 'You told the client the team needs breathing room.'),
        },
        {
          label: 'Pretend you saw nothing',
          hint: 'Morale −9',
          apply: (s) => note(adjust(s, { morale: -9 }), `${dev.name} is still answering recruiters.`, 'bad'),
        },
      ];
    },
  },

  'friday-deploy': {
    title: 'Friday deploy',
    setup: (state, rng) => {
      const shipped = state.tickets.filter((t) => t.shippedDay === state.day && t.dueDay === null);
      return shipped.length ? { id: 'friday-deploy', ticketId: rng.pick(shipped).id } : null;
    },
    body: (state, ev) => `${find(state, ev.ticketId).title} went live at 4:55pm on a Friday. By 6pm the on-call phone was ringing.`,
    choices: (state, ev) => {
      const t = find(state, ev.ticketId);
      return [
        {
          label: 'Someone fixes it over the weekend',
          hint: 'Morale −15',
          apply: (s) => note(adjust(s, { morale: -15 }), `The team spent Saturday patching ${t.title}.`, 'bad'),
        },
        {
          label: 'Roll it back until Monday',
          hint: `${t.title} is un-shipped with 2 pts left to redo`,
          apply: (s) =>
            note(patch(s, t.id, (x) => ({ shippedDay: null, progress: x.effort - 2 })), `${t.title} was rolled back.`, 'bad'),
        },
      ];
    },
  },

  /* The fixed beat: every Friday except the last. */

  review: {
    title: 'Weekly review',
    setup: () => ({ id: 'review' }),
    body: (state) => {
      const week = weekOf(state.day);
      const n = state.tickets.filter((t) => !isOpen(t) && t.dueDay === null && weekOf(t.shippedDay!) === week).length;
      const late = scoped(state).filter((t) => t.mustHave);
      const shipped = n === 0 ? 'Nothing shipped this week' : n === 1 ? 'One ticket shipped this week' : `${n} tickets shipped this week`;
      const musts = late.length ? `Still open: ${late.map((t) => t.title).join(', ')}.` : 'Every must-have so far is live.';
      return `Week ${week} is over and the client wants to see where things stand. ${shipped}. ${musts}`;
    },
    choices: (state) => {
      const week = weekOf(state.day);
      const late = scoped(state).filter((t) => t.mustHave).length;
      const trust = late ? -10 * late : 5;
      return [
        {
          label: late ? 'Explain what slipped' : 'Show them what shipped',
          hint: `Trust ${signed(trust)}${late ? ' · late must-haves stay on the board' : ''}`,
          apply: (s) =>
            note(
              adjust(s, { trust }),
              late ? `The week ${week} review went badly: must-haves are late.` : `The week ${week} review landed well.`,
              late ? 'bad' : 'good',
            ),
        },
      ];
    },
  },
};

for (const [id, def] of Object.entries(EVENTS)) {
  const setup = def.setup;
  def.setup = (...args) => {
    const ev = setup(...args);
    return ev && { ...ev, id };
  };
}

/** Accidents the player invites with the day's plan. At most one fires per day. */
export interface Hazard {
  id: EventId;
  chance: number;
  /** A warning if today's plan is exposed to this, else null. */
  risk(plan: GameState): string | null;
}

export const HAZARDS: Hazard[] = [
  {
    id: 'db-wipe',
    chance: 0.25,
    risk: (plan) => {
      const t = ticketOf(plan, 'cy');
      return t && t.kind === 'be' && crewOf(plan, t.id).length === 1 ? 'Cy is alone on backend work, unsupervised, with production access.' : null;
    },
  },
  {
    id: 'merge-hell',
    chance: 0.3,
    risk: (plan) => {
      const t = ticketOf(plan, 'ada');
      return t && crewOf(plan, t.id).length === 3 ? `Three people on ${t.title} means merge conflicts.` : null;
    },
  },
  {
    id: 'idle-hands',
    chance: 0.25,
    risk: (plan) => {
      const idle = DEV_ORDER.filter((d) => !plan.out.includes(d) && !ticketOf(plan, d));
      return idle.length && plan.tickets.some(isOpen) ? 'Bored developers get creative.' : null;
    },
  },
  {
    id: 'recruiter',
    chance: 0.25,
    risk: (plan) => (plan.morale < LOW_MORALE ? 'Morale is low. Recruiters can smell it.' : null),
  },
  {
    id: 'friday-deploy',
    chance: 0.3,
    risk: (plan) => {
      if (!isFriday(plan.day) || plan.day >= DAYS) return null;
      const ships = plan.tickets.some(
        (t) => isOpen(t) && t.dueDay === null && crewOf(plan, t.id).reduce((sum, d) => sum + outputOf(plan, d), 0) >= remaining(t),
      );
      return ships ? 'Something ships today, and today is Friday.' : null;
    },
  },
];

const FIXED = new Set(['review', ...HAZARDS.map((h) => h.id)]);
/** Everything that can turn up on an ordinary evening. */
export const RANDOM_EVENTS: EventId[] = Object.keys(EVENTS).filter((id) => !FIXED.has(id));
