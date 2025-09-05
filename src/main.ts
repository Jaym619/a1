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

type State = Readonly<{
    gameEnd: boolean;

    // Bird velocity and position
    birdY: number;
    birdVy: number;
}>;

const initialState: State = {
    gameEnd: false,

    // middle of screen, not falling start
    birdY: Viewport.CANVAS_HEIGHT / 2 - Birb.HEIGHT / 2,
    birdVy: 0,
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

    // placeholder pipes
    const pipeGapY = 200;
    const pipeGapHeight = 100;

    // Top pipe
    const pipeTop = createSvgElement(svg.namespaceURI, "rect", {
        x: "150",
        y: "0",
        width: String(Constants.PIPE_WIDTH),
        height: String(pipeGapY - pipeGapHeight / 2),
        fill: "green",
    });
    const pipeBottom = createSvgElement(svg.namespaceURI, "rect", {
        x: "150",
        y: String(pipeGapY + pipeGapHeight / 2),
        width: String(Constants.PIPE_WIDTH),
        height: String(Viewport.CANVAS_HEIGHT - (pipeGapY + pipeGapHeight / 2)),
        fill: "green",
    });
    svg.appendChild(pipeTop);
    svg.appendChild(pipeBottom);

    return (s: State) => {
        birdImg.setAttribute("y", String(s.birdY));
        // later stuff to be added here
    };
};

export const state$ = (csvContents: string): Observable<State> => {
    /** User input */
    const key$ = fromEvent<KeyboardEvent>(document, "keypress");
    const fromKey = (keyCode: Key) =>
        key$.pipe(filter(({ code }) => code === keyCode));

    /** Determines the rate of time steps */
    const tick$ = interval(Constants.TICK_RATE_MS);

    const dt$ = tick$.pipe(map(() => Constants.TICK_RATE_MS / 1000));

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

    // gravity physics
    const TOP = 0;
    const GROUND = Viewport.CANVAS_HEIGHT - Birb.HEIGHT;

    const physics$ = dt$.pipe(
        map(dt => (s: State): State => {
            let vy = s.birdVy + Constants.GRAVITY * dt;
            let y = s.birdY + vy * dt;

            if (y >= GROUND) {
                y = GROUND;
                vy = 0;
            }
            if (y <= TOP) {
                y = TOP;
                vy = 0;
            }

            return { ...s, birdY: y, birdVy: vy };
        }),
    );

    // final state$
    return merge(physics$, flap$).pipe(
        scan((s, reduce) => reduce(s), initialState),
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
