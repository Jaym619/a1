import { Observable, merge, interval } from "rxjs";
import { map, scan, startWith } from "rxjs/operators";
import { GameState } from "./types";
import { spacebar$ } from "./observable";
import { randomBounce } from "./util";

type Event = { type: "TICK" } | { type: "FLAP" };

export function state$(csvContents: string): Observable<GameState> {
  const tick$: Observable<Event> = interval(20).pipe(
    map(() => ({ type: "TICK" as const }))
  );
  const flap$: Observable<Event> = spacebar$.pipe(
    map(() => ({ type: "FLAP" as const }))
  );

  const events$: Observable<Event> = merge(tick$, flap$);

  const initial: GameState = {
    bird: { x: 50, y: 100, velocity: 0 },
    pipes: [],
    score: 0,
    lives: 3,
    gameEnd: false,
  };

  const reducer = (state: GameState, event: Event): GameState => {
    switch (event.type) {
      case "TICK":
        return { ...state, bird: { ...state.bird, y: state.bird.y + state.bird.velocity } };
      case "FLAP":
        return { ...state, bird: { ...state.bird, velocity: -5 } };
    }
  };

  return events$.pipe(
    scan(reducer, initial),
    startWith(initial)
  );
}
