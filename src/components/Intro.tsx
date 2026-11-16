import { DAYS_PER_WEEK, WEEKS } from '../engine/content';
import { dailySeed } from '../seed';

export function Intro({ seed, onStart }: { seed: string; onStart(): void }) {
  return (
    <div className="overlay">
      <div className="dialog intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
        <p className="eyebrow">{seed === dailySeed() ? `Today’s launch · ${seed}` : `Launch “${seed}”`}</p>
        <h2 id="intro-title">You have three weeks to launch.</h2>
        <p className="dialog-body">
          {WEEKS} weeks, {DAYS_PER_WEEK} days each, three developers, and more work than will fit. Each morning, decide who works on
          what. Each evening, deal with whatever the day threw at you. Every Monday brings a new backlog.
        </p>
        <ul className="rules">
          <li>
            <b>Only shipped tickets count.</b> Half-built work is worth nothing.
          </li>
          <li>
            <b>Play people to their strengths.</b> The junior doubles their pace when pairing.
          </li>
          <li>
            <b>Ship every must-have by the last Friday to win.</b> Miss one and the launch is off.
          </li>
          <li>
            <b>Guard morale and trust.</b> Every day wears morale down and every day without a ship costs trust. At zero morale someone quits for good; at zero trust you lose on the spot.
          </li>
          <li>
            <b>Risky plans can backfire.</b> Leave the junior alone with the database and see.
          </li>
        </ul>
        <button className="run" autoFocus onClick={onStart}>
          Start week 1 <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}
