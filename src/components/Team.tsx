import { DEVS, DEV_ORDER } from '../engine/content';
import { outputOf } from '../engine/engine';
import type { DevId, GameState } from '../engine/types';

interface Props {
  game: GameState;
  selected: DevId | null;
  onSelect(dev: DevId): void;
}

export function Team({ game, selected, onSelect }: Props) {
  return (
    <section className="team" aria-label="Team">
      {DEV_ORDER.map((id, i) => {
        const dev = DEVS[id];
        const out = game.out.includes(id);
        const ticket = game.tickets.find((t) => t.id === game.assignments[id]);
        const status = out ? 'Out sick today' : ticket ? `${ticket.title} · +${outputOf(game, id)}` : 'Nothing to do';
        return (
          <button
            key={id}
            className={`dev ${id}${selected === id ? ' selected' : ''}${!out && !ticket ? ' free' : ''}`}
            disabled={out || game.phase !== 'planning'}
            aria-pressed={selected === id}
            onClick={() => onSelect(id)}
            title={dev.blurb}
          >
            <span className="avatar" aria-hidden>
              {dev.name[0]}
            </span>
            <span className="dev-text">
              <span className="dev-name">
                {dev.name} <small>{dev.role}</small>
              </span>
              <span className="dev-skill">
                FE {dev.skill.fe} · BE {dev.skill.be}
                {dev.pairBonus > 0 && ` · +${dev.pairBonus} paired`}
              </span>
              <span className="dev-status">{status}</span>
            </span>
            <kbd aria-hidden>{i + 1}</kbd>
          </button>
        );
      })}
    </section>
  );
}
