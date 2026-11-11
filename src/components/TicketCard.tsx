import { DEVS, DEV_ORDER } from '../engine/content';
import { outputOf } from '../engine/engine';
import type { DevId, GameState, Ticket } from '../engine/types';

interface Props {
  game: GameState;
  ticket: Ticket;
  /** The dev a click would assign here, if any. */
  selected: DevId | null;
  onAssign(): void;
  onUnassign(dev: DevId): void;
}

const KIND = { fe: 'Frontend', be: 'Backend' } as const;

export function TicketCard({ game, ticket, selected, onAssign, onUnassign }: Props) {
  const shipped = ticket.shippedDay !== null;
  const crew = DEV_ORDER.filter((d) => game.assignments[d] === ticket.id);
  const left = ticket.effort - ticket.progress;
  const planned = Math.min(left, crew.reduce((sum, d) => sum + outputOf(game, d), 0));
  const pct = (n: number) => `${(n / ticket.effort) * 100}%`;
  const canAssign = !shipped && selected !== null && game.assignments[selected] !== ticket.id;

  return (
    <article className={`ticket ${ticket.kind}${shipped ? ' shipped' : ''}${ticket.dueDay !== null ? ' hotfix' : ''}`}>
      <button
        className="ticket-main"
        disabled={!canAssign}
        onClick={onAssign}
        aria-label={canAssign ? `Assign ${DEVS[selected].name} to ${ticket.title}` : ticket.title}
      >
        <span className="tags">
          <span className="tag kind">{KIND[ticket.kind]}</span>
          {ticket.mustHave && <span className="tag must">Must-have</span>}
          {ticket.dueDay !== null && !shipped && <span className="tag due">Due day {ticket.dueDay}</span>}
        </span>
        <span className="ticket-title">{ticket.title}</span>
        <span className="bar" aria-hidden>
          <span className="bar-done" style={{ width: pct(ticket.progress) }} />
          <span className="bar-plan" style={{ width: pct(planned) }} />
        </span>
        <span className="ticket-meta">
          <span>
            {ticket.progress}/{ticket.effort} pts
            {planned > 0 && <em> +{planned} today</em>}
          </span>
          <span className="worth">{ticket.value > 0 ? `value ${ticket.value}` : 'no value, just pain'}</span>
        </span>
        {shipped && <span className="stamp">Shipped</span>}
      </button>

      {crew.length > 0 && (
        <div className="crew">
          {crew.map((d) => (
            <button key={d} className={`chip ${d}`} onClick={() => onUnassign(d)} title={`Take ${DEVS[d].name} off this ticket`}>
              {DEVS[d].name} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
