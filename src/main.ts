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
    withLatestFrom,
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

    scoredIds: ReadonlyArray<number>;
    hurtCooldown: number;
    flapCooldown: number;
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

    scoredIds: [],
    hurtCooldown: 0,
    flapCooldown: 0,
};

// helper function for generating stream
const randStep = (seed: number) => {
    const a = 1664525,
        c = 1013904223,
        m = 2 ** 32;
    const next = (a * seed + c) >>> 0;
    return { nextSeed: next, value: next / m };
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

    // sets background
    const bg = createSvgElement(svg.namespaceURI, "image", {
        id: "bg",
        href: "assets/bg-flappy.webp",
        x: "0",
        y: "0",
        width: String(Viewport.CANVAS_WIDTH),
        height: String(Viewport.CANVAS_HEIGHT),
        preserveAspectRatio: "none",
    });
    svg.appendChild(bg);

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

        // updates lives and score
        if (livesText) livesText.textContent = `Lives: ${s.lives}`;
        if (scoreText) scoreText.textContent = `Score: ${s.score}`;

        // when player runs out of lives game over displays
        if (gameOver)
            gameOver.setAttribute(
                "visibility",
                s.gameEnd ? "visible" : "hidden",
            );

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
    // flap (ignore when over)
    const flap$ = merge(
        fromEvent<MouseEvent>(document, "mousedown"),
        fromEvent<TouchEvent>(document, "touchstart"),
    ).pipe(
        map(
            () =>
                (s: State): State =>
                    s.gameEnd || s.flapCooldown > 0
                        ? s
                        : {
                              ...s,
                              birdVy: Constants.FLAP_VELOCITY,
                              flapCooldown: 0.12,
                          },
        ),
    );

    // time
    const dt$ = interval(Constants.TICK_RATE_MS).pipe(
        map(() => Constants.TICK_RATE_MS / 1000),
    );

    const random$ = dt$.pipe(
        scan(seed => randStep(seed).nextSeed, 0xc0ffee),
        map(seed => randStep(seed).value),
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

    // currently difficult to make it through pipes
    // may need to change pipe speed value later
    const PIPE_SPEED = 200;
    const TOP = 0;
    const GROUND = Viewport.CANVAS_HEIGHT - Birb.HEIGHT - 65;
    const birdX = Viewport.CANVAS_WIDTH * 0.3 - Birb.WIDTH / 2;

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
        withLatestFrom(random$),
        map(([dt, r]) => (s: State): State => {
            if (s.gameEnd) {
                const vy = s.birdVy + Constants.GRAVITY * dt;
                // player can fall through ground (accurate to real flappy bird btw)
                const y = s.birdY + vy * dt;
                return {
                    ...s,
                    birdVy: vy,
                    birdY: y,

                    // player can't flap
                    flapCooldown: 0,
                };
            }

            // advance time and cooldown
            const elapsed = s.elapsed + dt;
            const hurtCooldown = Math.max(0, s.hurtCooldown - dt);
            const flapCooldown = Math.max(0, s.flapCooldown - dt);

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

            // all collisions (ground, top of display, pipes)

            const bumpDown = 150 + r * 200;
            const bumpUp = 250 + r * 170;

            let lives = s.lives;
            let hit = false;

            // screen edge hits
            if (birdY <= TOP) {
                hit = true;
                birdVy = bumpDown;
            }
            if (birdY >= GROUND) {
                hit = true;
                birdVy = -bumpUp;
                birdY = GROUND;
            }

            // pipe hits
            const overlaps = (
                a: { x: number; y: number; w: number; h: number },
                b: { x: number; y: number; w: number; h: number },
            ) =>
                a.x < b.x + b.w &&
                a.x + a.w > b.x &&
                a.y < b.y + b.h &&
                a.y + a.h > b.y;

            const birdBox = {
                x: birdX,
                y: birdY,
                w: Birb.WIDTH,
                h: Birb.HEIGHT,
            };
            for (const p of pipes) {
                const half = p.gapH / 2;
                const topH = Math.max(0, p.gapY - half);
                const botY = Math.min(Viewport.CANVAS_HEIGHT, p.gapY + half);
                const topRect = {
                    x: p.x,
                    y: 0,
                    w: Constants.PIPE_WIDTH,
                    h: topH,
                };
                const botRect = {
                    x: p.x,
                    y: botY,
                    w: Constants.PIPE_WIDTH,
                    h: Viewport.CANVAS_HEIGHT - botY,
                };

                if (overlaps(birdBox, topRect)) {
                    hit = true;
                    birdVy = bumpDown;
                    break;
                }
                if (overlaps(birdBox, botRect)) {
                    hit = true;
                    birdVy = -bumpUp;
                    break;
                }
            }

            // apply damage once per cooldown window
            if (hit && hurtCooldown <= 0 && !s.gameEnd) {
                lives = Math.max(0, lives - 1);
            }

            const gameEnd = lives <= 0;

            if (s.gameEnd) {
                return { ...s, flapCooldown: 0 };
            }

            // scoring when passing a pipe
            // bird passes when its right edge has gone beyond pipes right edge
            const birdRight = birdX + Birb.WIDTH;
            const newlyPassed = pipes
                .filter(
                    p =>
                        p.x + Constants.PIPE_WIDTH < birdRight &&
                        !s.scoredIds.includes(p.id),
                )
                .map(p => p.id);

            const score = s.score + newlyPassed.length;
            const scoredIds = newlyPassed.length
                ? s.scoredIds.concat(newlyPassed)
                : s.scoredIds;

            // final next state
            return {
                ...s,
                elapsed,
                flapCooldown,
                remainingDefs: future,
                pipes,
                birdY,
                birdVy,
                lives,
                score,
                scoredIds,
                hurtCooldown:
                    hit && hurtCooldown <= 0 && !gameEnd ? 0.6 : hurtCooldown, // 600ms invuln
                gameEnd,
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
