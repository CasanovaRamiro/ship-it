import { DAYS, DAYS_PER_WEEK, LOW_MORALE, LOW_TRUST, isFriday, weekOf } from '../engine/content';
import { valueShipped } from '../engine/engine';
import type { GameState } from '../engine/types';

function Meter({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`meter${warn ? ' warn' : ''}`}>
      <span className="meter-label">{label}</span>
      <span className="meter-track" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <span className="meter-fill" style={{ width: `${value}%` }} />
      </span>
      <span className="meter-value">{value}</span>
    </div>
  );
}

export function Header({ game }: { game: GameState }) {
  const over = game.phase === 'over';
  return (
    <header className="header">
      <h1>
        <span aria-hidden>📦</span> Ship It!
      </h1>

      <ol className="timeline" aria-label={over ? 'Game over' : `Day ${game.day} of ${DAYS}, week ${weekOf(game.day)}`}>
        {Array.from({ length: DAYS }, (_, i) => i + 1).map((day) => {
          const state = day < game.day || (over && day === game.day) ? 'past' : day === game.day ? 'now' : 'future';
          return (
            <li key={day} className={`${state}${day % DAYS_PER_WEEK === 1 ? ' monday' : ''}`}>
              <span className="pip">{day}</span>
              {isFriday(day) && <span className="flag">{day === DAYS ? 'launch' : 'review'}</span>}
            </li>
          );
        })}
      </ol>

      <div className="meters">
        <Meter label="Morale" value={game.morale} warn={game.morale < LOW_MORALE} />
        <Meter label="Trust" value={game.trust} warn={game.trust < LOW_TRUST} />
        <div className="value">
          <span className="meter-label">Value shipped</span>
          <strong>{valueShipped(game)}</strong>
        </div>
      </div>
    </header>
  );
}
