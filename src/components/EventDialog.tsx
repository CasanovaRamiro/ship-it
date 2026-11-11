import { useEffect, useRef } from 'react';
import type { EventView } from '../engine/engine';

interface Props {
  day: number;
  event: EventView;
  onChoose(index: number): void;
}

export function EventDialog({ day, event, onChoose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Focus the dialog itself, not a choice: a stray Enter shouldn't make the call for you.
  useEffect(() => ref.current?.focus(), []);

  return (
    <div className="overlay delayed">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="event-title" tabIndex={-1} ref={ref}>
        <p className="eyebrow">End of day {day}</p>
        <h2 id="event-title">{event.title}</h2>
        <p className="dialog-body">{event.body}</p>
        <div className="choices">
          {event.choices.map((choice, i) => (
            <button key={choice.label} className="choice" onClick={() => onChoose(i)}>
              <strong>{choice.label}</strong>
              <small>{choice.hint}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
