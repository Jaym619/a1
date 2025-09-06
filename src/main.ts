/**
 * Inside this file you will use the classes and functions from rx.js
 * to add visuals to the svg element in index.html, animate them, and make them interactive.
 *
 * Study and complete the tasks in observable exercises first to get ideas.
 *
 * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
 *
 * You will be marked on your functional programming style
 * as well as the functionality that you implement.
 *
 * Document your code!
 */

import "./style.css";

import {
    Observable,
    catchError,
    filter,
    fromEvent,
    interval,
    map,
    scan,
    switchMap,
    take,
    merge,
} from "rxjs";
import { fromFetch } from "rxjs/fetch";

/** Constants */

const Viewport = {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 400,
} as const;

const Birb = {
    WIDTH: 42,
    HEIGHT: 30,
} as const;

const Constants = {
    GRAVITY: 2000,
    FLAP_VELOCITY: -520,
    PIPE_WIDTH: 50,
    TICK_RATE_MS: 16,
} as const;

// User input

type Key = "Space";

// State processing

type Pipe = Readonly<{ id: number; x: number; gapY: number; gapH: number }>;
type PipeDef = Readonly<{ time: number; gapYpx: number; gapHpx: number }>;

type State = Readonly<{
    gameEnd: boolean;

    // Bird velocity and position
    birdY: number;
    birdVy: number;

    // pipes + game stats
    pipes: ReadonlyArray<Pipe>;
    score: number;
    lives: number;

    elapsed: number;
    remainingDefs: ReadonlyArray<PipeDef>;
}>;

const initialState: State = {
    gameEnd: false,

    // middle of screen, not falling start
    birdY: Viewport.CANVAS_HEIGHT / 2 - Birb.HEIGHT / 2,
    birdVy: 0,

    pipes: [],
    score: 0,
    lives: 3,

    elapsed: 0,
    remainingDefs: [],
};

/**
 * Updates the state by proceeding with one time step.
 *
 * @param s Current state
 * @returns Updated state
 */
const tick = (s: State) => s;

// Rendering (side effects)

/**
 * Brings an SVG element to the foreground.
 * @param elem SVG element to bring to the foreground
 */
const bringToForeground = (elem: SVGElement): void => {
    elem.parentNode?.appendChild(elem);
};

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: SVGElement): void => {
    elem.setAttribute("visibility", "visible");
    bringToForeground(elem);
};

/**
 * Hides a SVG element on the canvas.
 * @param elem SVG element to hide
 */
const hide = (elem: SVGElement): void => {
    elem.setAttribute("visibility", "hidden");
};

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
    namespace: string | null,
    name: string,
    props: Record<string, string> = {},
): SVGElement => {
    const elem = document.createElementNS(namespace, name) as SVGElement;
    Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
    return elem;
};

const render = (): ((s: State) => void) => {
    // Canvas elements
    const gameOver = document.querySelector("#gameOver") as SVGElement;
    const container = document.querySelector("#main") as HTMLElement;

    // Text fields
    const livesText = document.querySelector("#livesText") as HTMLElement;
    const scoreText = document.querySelector("#scoreText") as HTMLElement;

    const svg = document.querySelector("#svgCanvas") as SVGSVGElement;
    svg.setAttribute(
        "viewBox",
        `0 0 ${Viewport.CANVAS_WIDTH} ${Viewport.CANVAS_HEIGHT}`,
    );

    // Create the bird once
    const birdImg = createSvgElement(svg.namespaceURI, "image", {
        id: "bird",
        href: "assets/birb.png",
        x: String(Viewport.CANVAS_WIDTH * 0.3 - Birb.WIDTH / 2),
        y: String(initialState.birdY),
        width: String(Birb.WIDTH),
        height: String(Birb.HEIGHT),
    }) as SVGImageElement;
    svg.appendChild(birdImg);

    // create pipes group once
    const pipesG = createSvgElement(svg.namespaceURI, "g", {
        id: "pipes",
    }) as SVGGElement;
    svg.appendChild(pipesG);

    // frame updater
    return (s: State) => {
        // move bird
        birdImg.setAttribute("y", String(s.birdY));

        // draw pipes from csv
        pipesG.innerHTML = "";

        for (const p of s.pipes) {
            const half = p.gapH / 2;
            const topY = Math.max(
                0,
                Math.min(Viewport.CANVAS_HEIGHT, p.gapY - half),
            );
            const botY = Math.max(
                0,
                Math.min(Viewport.CANVAS_HEIGHT, p.gapY + half),
            );

            const topH = Math.max(0, topY);
            const bottomH = Math.max(0, Viewport.CANVAS_HEIGHT - botY);

            const top = createSvgElement(svg.namespaceURI, "rect", {
                x: String(p.x),
                y: "0",
                width: String(Constants.PIPE_WIDTH),
                height: String(topH),
                fill: "green",
                stroke: "black",
                "stroke-width": "1",
            });

            const bottom = createSvgElement(svg.namespaceURI, "rect", {
                x: String(p.x),
                y: String(botY),
                width: String(Constants.PIPE_WIDTH),
                height: String(bottomH),
                fill: "green",
                stroke: "black",
                "stroke-width": "1",
            });

            pipesG.appendChild(top);
            pipesG.appendChild(bottom);
        }
    };
};

export const state$ = (csvContents: string): Observable<State> => {
    // mouse click input
    const pointerDown$ = merge(
        fromEvent<MouseEvent>(document, "mousedown"),
        fromEvent<TouchEvent>(document, "touchstart"),
    );

    // bird flap (aka birb goes up)
    const flap$ = pointerDown$.pipe(
        map(
            () =>
                (s: State): State => ({
                    ...s,
                    birdVy: Constants.FLAP_VELOCITY,
                }),
        ),
    );

    // time
    const dt$ = interval(Constants.TICK_RATE_MS).pipe(
        map(() => Constants.TICK_RATE_MS / 1000),
    );

    // csv pipe definitions
    const parsePipes = (csv: string): ReadonlyArray<PipeDef> => {
        const lines = csv
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);
        const body = /^gap_y\s*,\s*gap_height\s*,\s*time/i.test(lines[0])
            ? lines.slice(1)
            : lines;

        return body
            .map(line => {
                const [gy, gh, t] = line.split(",");
                const gapYpx = Math.max(
                    0,
                    Math.min(
                        Viewport.CANVAS_HEIGHT,
                        Number(gy) * Viewport.CANVAS_HEIGHT,
                    ),
                );
                const gapHpx = Math.max(
                    10,
                    Math.min(
                        Viewport.CANVAS_HEIGHT,
                        Number(gh) * Viewport.CANVAS_HEIGHT,
                    ),
                );
                const time = Number(t);
                return { time, gapYpx, gapHpx };
            })
            .filter(d => Number.isFinite(d.time))
            .sort((a, b) => a.time - b.time);
    };

    const pipeDefs = parsePipes(csvContents);

    const PIPE_SPEED = 150;
    const TOP = 0;
    const GROUND = Viewport.CANVAS_HEIGHT - Birb.HEIGHT;

    // small pure partition helper
    const partition = <T>(
        xs: ReadonlyArray<T>,
        pred: (x: T) => boolean,
    ): [ReadonlyArray<T>, ReadonlyArray<T>] => {
        const a: T[] = [],
            b: T[] = [];
        xs.forEach(x => (pred(x) ? a : b).push(x));
        return [a, b];
    };

    // tick reducer
    const tick$ = dt$.pipe(
        map(dt => (s: State): State => {
            const elapsed = s.elapsed + dt;

            // spawn any definitions whose time has arrived
            const [due, future] = partition(
                s.remainingDefs,
                d => d.time <= elapsed,
            );
            const spawned: ReadonlyArray<Pipe> = due.map((d, i) => ({
                id: s.pipes.length + i + 1,

                // pipes appear at right edge
                x: Viewport.CANVAS_WIDTH,

                gapY: d.gapYpx,
                gapH: d.gapHpx,
            }));

            // move existing + spawned pipes left get culled off screen
            const pipes = s.pipes
                .concat(spawned)
                .map(p => ({ ...p, x: p.x - PIPE_SPEED * dt }))
                .filter(p => p.x + Constants.PIPE_WIDTH >= 0);

            // gravity physics
            let birdVy = s.birdVy + Constants.GRAVITY * dt;
            let birdY = s.birdY + birdVy * dt;
            if (birdY >= GROUND) {
                birdY = GROUND;
                birdVy = 0;
            }
            if (birdY <= TOP) {
                birdY = TOP;
                birdVy = 0;
            }

            return {
                ...s,
                elapsed,
                remainingDefs: future,
                pipes,
                birdY,
                birdVy,
            };
        }),
    );

    // seeds initial state
    const seededInitial: State = {
        ...initialState,
        elapsed: 0,
        remainingDefs: pipeDefs,
    };

    // final state$
    return merge(tick$, flap$).pipe(
        scan((s, reduce) => reduce(s), seededInitial),
    );
};

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    const { protocol, hostname, port } = new URL(import.meta.url);
    const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ""}`;
    const csvUrl = `${baseUrl}/assets/map.csv`;

    // Get the file from URL
    const csv$ = fromFetch(csvUrl).pipe(
        switchMap(response => {
            if (response.ok) {
                return response.text();
            } else {
                throw new Error(`Fetch error: ${response.status}`);
            }
        }),
        catchError(err => {
            console.error("Error fetching the CSV file:", err);
            throw err;
        }),
    );

    // Observable: wait for first user click
    const click$ = fromEvent(document.body, "mousedown").pipe(take(1));

    csv$.pipe(
        switchMap(contents =>
            // On click - start the game
            click$.pipe(switchMap(() => state$(contents))),
        ),
    ).subscribe(render());
}
