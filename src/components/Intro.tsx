import { DAYS } from '../engine/content';
import { dailySeed } from '../seed';

export function Intro({ seed, onStart }: { seed: string; onStart(): void }) {
  return (
    <div className="overlay">
      <div className="dialog intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
        <p className="eyebrow">{seed === dailySeed() ? `Today’s sprint · ${seed}` : `Sprint “${seed}”`}</p>
        <h2 id="intro-title">You’re running this sprint.</h2>
        <p className="dialog-body">
          {DAYS} days, three developers, and more work than will fit. Each morning, decide who works on what. Each evening,
          deal with whatever the day threw at you.
        </p>
        <ul className="rules">
          <li>
            <b>Only shipped tickets count.</b> Half-built work is worth nothing.
          </li>
          <li>
            <b>Play people to their strengths.</b> The junior doubles their pace when pairing.
          </li>
          <li>
            <b>Miss a must-have and the sprint failed,</b> no matter what else went out.
          </li>
        </ul>
        <button className="run" autoFocus onClick={onStart}>
          Start the sprint <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}
