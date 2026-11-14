import { useState } from 'react';
import { WEEKS, WEEK_NAMES } from '../engine/content';
import { score } from '../engine/engine';
import type { DayRecord, GameState } from '../engine/types';
import { shareText } from '../share';

/** Value shipped over the sprint (line) against work landed each day (bars). */
function BurnUp({ history }: { history: DayRecord[] }) {
  const w = 320;
  const h = 120;
  const pad = 18;
  const step = (w - pad * 2) / history.length;
  const maxValue = Math.max(1, ...history.map((d) => d.valueShipped));
  const maxPoints = Math.max(1, ...history.map((d) => d.points));
  const x = (i: number) => pad + step * (i + 0.5);
  const y = (v: number, max: number) => h - pad - (v / max) * (h - pad * 2);
  const line = history.map((d, i) => `${x(i)},${y(d.valueShipped, maxValue)}`).join(' ');

  return (
    <svg className="burnup" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Work landed per day and cumulative value shipped">
      {history.map((d, i) => (
        <g key={d.day}>
          <rect className="burnup-bar" x={x(i) - step * 0.3} y={y(d.points, maxPoints)} width={step * 0.6} height={h - pad - y(d.points, maxPoints)} rx="2" />
          <text className="burnup-day" x={x(i)} y={h - 4} textAnchor="middle">
            {d.day}
          </text>
        </g>
      ))}
      <polyline className="burnup-line" points={line} />
      {history.map((d, i) => (
        <circle key={d.day} className="burnup-dot" cx={x(i)} cy={y(d.valueShipped, maxValue)} r="3" />
      ))}
    </svg>
  );
}

interface Props {
  game: GameState;
  onReplay(): void;
  onNew(): void;
}

export function Scorecard({ game, onReplay, onNew }: Props) {
  const card = score(game);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText(game));
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <main className="scorecard">
      <p className={`outcome ${card.won ? 'won' : 'lost'}`} role="status">
        <span aria-hidden>{card.won ? '🚀' : '💥'}</span> {card.headline}
      </p>

      <section className="verdict">
        <div className={`grade grade-${card.grade}`} aria-label={`Grade ${card.grade}`}>
          {card.grade}
        </div>
        <div>
          <p className="eyebrow">
            {card.won ? 'Launched' : 'Did not launch'} · “{game.seed}” · {card.score} pts
          </p>
          <h2>{card.title}</h2>
          <p className="dialog-body">{card.blurb}</p>
        </div>
      </section>

      <section className="results">
        <div className="panel">
          <h3>
            What shipped <small>{card.shipped}/{card.total}</small>
          </h3>
          {Array.from({ length: WEEKS }, (_, i) => i + 1).map((week) => {
            const tickets = game.tickets.filter((t) => t.dueDay === null && t.week === week);
            if (tickets.length === 0) return null;
            return (
              <div key={week}>
                <h4 className="week-heading">
                  Week {week} · {WEEK_NAMES[week - 1]}
                </h4>
                <ul className="shipped-list">
                  {tickets.map((t) => (
                    <li key={t.id} className={t.shippedDay === null ? (t.mustHave ? 'miss fatal' : 'miss') : 'hit'}>
                      <span aria-hidden>{t.shippedDay === null ? (t.mustHave ? '✕' : '○') : '●'}</span>
                      <span>
                        {t.title}
                        {t.mustHave && <em> must-have</em>}
                      </span>
                      <span className="worth">{t.shippedDay === null ? `${t.progress}/${t.effort} pts` : `day ${t.shippedDay} · +${t.value}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="panel">
          <h3>How it went</h3>
          <BurnUp history={game.history} />
          <p className="legend">
            <span className="key bar-key" /> work per day <span className="key line-key" /> value shipped
          </p>
          <dl className="stats">
            <div>
              <dt>Value</dt>
              <dd>{card.valueShipped}</dd>
            </div>
            <div>
              <dt>Morale</dt>
              <dd>{card.morale}</dd>
            </div>
            <div>
              <dt>Trust</dt>
              <dd>{card.trust}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="actions">
        <button className="run" onClick={copy}>
          {copied === 'done' ? 'Copied ✓' : 'Copy result'}
        </button>
        <button className="ghost" onClick={onReplay}>
          Replay this one
        </button>
        <button className="ghost" onClick={onNew}>
          New random game
        </button>
      </div>
      {copied === 'failed' && (
        <textarea className="share-fallback" readOnly rows={5} value={shareText(game)} onFocus={(e) => e.target.select()} aria-label="Result to copy" />
      )}

      <footer className="credit">
        Designed and built by Ramiro Casanova ·{' '}
        <a href="https://github.com/CasanovaRamiro" target="_blank" rel="noreferrer">
          GitHub
        </a>{' '}
        ·{' '}
        <a href="https://www.linkedin.com/in/ramiro-casanova" target="_blank" rel="noreferrer">
          LinkedIn
        </a>
      </footer>
    </main>
  );
}
