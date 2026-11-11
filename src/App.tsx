import { useEffect, useState } from 'react';
import { EventDialog } from './components/EventDialog';
import { Header } from './components/Header';
import { Intro } from './components/Intro';
import { Scorecard } from './components/Scorecard';
import { Team } from './components/Team';
import { TicketCard } from './components/TicketCard';
import { DAYS, DEVS, DEV_ORDER } from './engine/content';
import { assign, choose, createGame, eventView, runDay, setCrunch } from './engine/engine';
import type { DevId, GameState } from './engine/types';
import { randomSeed, readSeed, writeSeed } from './seed';

/** The next person who still needs something to do, so planning is one click per dev. */
function firstIdle(game: GameState): DevId | null {
  return DEV_ORDER.find((d) => !game.out.includes(d) && game.assignments[d] === null) ?? null;
}

export function App() {
  const [game, setGame] = useState(() => createGame(readSeed()));
  const [started, setStarted] = useState(false);
  const [selected, setSelected] = useState<DevId | null>('ada');

  const update = (next: GameState, keep: DevId | null = null) => {
    setGame(next);
    setSelected(firstIdle(next) ?? keep);
  };

  const restart = (seed: string) => {
    writeSeed(seed);
    update(createGame(seed));
    setStarted(true);
  };

  const planning = started && game.phase === 'planning';

  useEffect(() => {
    if (!planning) return;
    const onKey = (e: KeyboardEvent) => {
      const dev = DEV_ORDER[Number(e.key) - 1];
      if (dev && !game.out.includes(dev)) setSelected(dev);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [planning, game.out]);

  if (game.phase === 'over') {
    return (
      <div className="page">
        <Header game={game} />
        <Scorecard game={game} onReplay={() => restart(game.seed)} onNew={() => restart(randomSeed())} />
      </div>
    );
  }

  const idle = DEV_ORDER.filter((d) => !game.out.includes(d) && game.assignments[d] === null);
  const event = started ? eventView(game) : null;

  return (
    <div className="page">
      <Header game={game} />
      <main className="board">
        <section className="tickets" aria-label="Backlog">
          {game.tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              game={game}
              ticket={ticket}
              selected={planning ? selected : null}
              onAssign={() => selected && update(assign(game, selected, ticket.id), selected)}
              onUnassign={(dev) => update(assign(game, dev, null))}
            />
          ))}
        </section>

        <aside className="side">
          <Team game={game} selected={selected} onSelect={setSelected} />

          <div className="controls">
            <label className={`crunch${game.crunch ? ' on' : ''}`}>
              <input type="checkbox" checked={game.crunch} disabled={!planning} onChange={(e) => setGame(setCrunch(game, e.target.checked))} />
              <span>
                <strong>Crunch today</strong>
                <small>Everyone +1 pt · morale −15</small>
              </span>
            </label>
            <button className="run" disabled={!planning} onClick={() => update(runDay(game))}>
              {game.day === DAYS ? 'Run the last day' : `Run day ${game.day}`} <span aria-hidden>→</span>
            </button>
            <p className="idle" role="status">
              {idle.length > 0 && planning ? `${idle.map((d) => DEVS[d].name).join(' and ')} ${idle.length > 1 ? 'have' : 'has'} nothing to do.` : ' '}
            </p>
          </div>

          <ol className="log" aria-label="Sprint log">
            {game.log.length === 0 && <li className="empty">Pick a person, then a ticket. Keys 1–3 switch people.</li>}
            {[...game.log].reverse().slice(0, 6).map((entry, i) => (
              <li key={game.log.length - i} className={entry.tone}>
                <span className="when">D{entry.day}</span> {entry.text}
              </li>
            ))}
          </ol>
        </aside>
      </main>

      {!started && <Intro seed={game.seed} onStart={() => setStarted(true)} />}
      {event && <EventDialog key={game.day} day={game.day} event={event} onChoose={(i) => update(choose(game, i))} />}
    </div>
  );
}
