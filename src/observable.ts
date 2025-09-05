import { fromEvent, Observable } from "rxjs";
import { filter } from "rxjs/operators";

export const key$ = fromEvent<KeyboardEvent>(document, "keydown");

export const spacebar$: Observable<KeyboardEvent> = key$.pipe(
  filter(e => e.code === "Space")
);

export function readPipes$(csv: string): Observable<string> {
  // placeholder
  return new Observable(observer => {
    observer.next(csv);
    observer.complete();
  });
}
