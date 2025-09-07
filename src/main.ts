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
    of,
    filter,
    share,
    repeat,
    takeUntil,
    shareReplay,
    defer,
    EMPTY,
    finalize,
    BehaviorSubject,
    ignoreElements,
    toArray,
} from "rxjs";
import { fromFetch } from "rxjs/fetch";

/** Constants */

const Viewport = {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 400,
    PIPE_GAP_TWEAK: 30,
} as const;

const Birb = {
    WIDTH: 42,
    HEIGHT: 30,
} as const;

const Constants = {
    GRAVITY: 2000,
    FLAP_VELOCITY: -400,
    PIPE_WIDTH: 50,
    TICK_RATE_MS: 16,
    PIPE_SPEED: 250,
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

    // score related
    scoredIds: ReadonlyArray<number>;
    nextPipeId: number;

    // cooldowns
    hurtCooldown: number;
    flapCooldown: number;

    started: boolean;

    // stores ALL ghosts now (originally showed only previous)
    ghostYs: ReadonlyArray<number>;
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
    nextPipeId: 1,
    hurtCooldown: 0,
    flapCooldown: 0,

    started: false,

    ghostYs: [],
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

    // Restart prompt (initially hidden)
    const restartText = createSvgElement(svg.namespaceURI, "text", {
        x: String(Viewport.CANVAS_WIDTH / 2),
        y: String(Viewport.CANVAS_HEIGHT / 2),
        "text-anchor": "middle",
        "font-family": "sans-serif",
        "font-size": "20",
        fill: "#fff",
        "paint-order": "stroke",
        stroke: "#000",
        "stroke-width": "2",
    }) as SVGTextElement;
    restartText.textContent = "Press R to restart";
    restartText.setAttribute("visibility", "hidden");

    // create pipes group once
    const pipesG = createSvgElement(svg.namespaceURI, "g", {
        id: "pipes",
    }) as SVGGElement;
    svg.appendChild(pipesG);
    svg.appendChild(restartText);

    // Ghosts container + reusable node cache (created once)
    const ghostsG = createSvgElement(svg.namespaceURI, "g", {
        id: "ghosts",
    }) as SVGGElement;
    svg.appendChild(ghostsG);
    const ghostImgs: SVGImageElement[] = []; // cache for ghosts

    // frame updater
    return (s: State) => {
        // move bird
        birdImg.setAttribute("y", String(s.birdY));
        restartText.setAttribute(
            "visibility",
            s.gameEnd ? "visible" : "hidden",
        );

        // update ghosts only (no innerHTML clears)
        while (ghostImgs.length < s.ghostYs.length) {
            const gi = createSvgElement(svg.namespaceURI, "image", {
                href: "assets/birb.png",
                x: String(Viewport.CANVAS_WIDTH * 0.3 - Birb.WIDTH / 2),
                y: "0",
                width: String(Birb.WIDTH),
                height: String(Birb.HEIGHT),
                opacity: "0.5",
                "pointer-events": "none",
            }) as SVGImageElement;
            ghostsG.appendChild(gi);
            ghostImgs.push(gi);
        }
        ghostImgs.forEach((img, i) => {
            const visible = i < s.ghostYs.length;
            img.setAttribute("visibility", visible ? "visible" : "hidden");
            if (visible) {
                img.setAttribute("y", String(s.ghostYs[i]));
            }
        });

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

// ChatGPT used to implement helper observables to get game restarting to work only at game end

export const state$ = (csvContents: string): Observable<State> => {
    // previous run’s recording
    const ghostFramesAll$ = new BehaviorSubject<
        ReadonlyArray<ReadonlyArray<number>>
    >([]);

    // constants
    const TOP = 0;
    const GROUND = Viewport.CANVAS_HEIGHT - Birb.HEIGHT - 65;
    const birdX = Viewport.CANVAS_WIDTH * 0.3 - Birb.WIDTH / 2;

    // helpers
    const partition = <T>(
        xs: ReadonlyArray<T>,
        pred: (x: T) => boolean,
    ): [ReadonlyArray<T>, ReadonlyArray<T>] => {
        const a: T[] = [],
            b: T[] = [];
        xs.forEach(x => (pred(x) ? a : b).push(x));
        return [a, b];
    };

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
                        Number(gh) * Viewport.CANVAS_HEIGHT +
                            Viewport.PIPE_GAP_TWEAK,
                    ),
                );
                const time = Number(t);
                return { time, gapYpx, gapHpx };
            })
            .filter(d => Number.isFinite(d.time))
            .sort((a, b) => a.time - b.time);
    };
    const pipeDefs = parsePipes(csvContents);

    // global streams
    const pointerDown$ = merge(
        fromEvent<MouseEvent>(document, "mousedown"),
        fromEvent<TouchEvent>(document, "touchstart"),
    ).pipe(share());

    const restartKey$ = fromEvent<KeyboardEvent>(document, "keydown").pipe(
        filter(e => e.code === "KeyR"),
    );

    // flap reducer gated until first click
    const rawFlap$ = pointerDown$.pipe(
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

    // geometry helpers (pure)
    const overlaps = (
        a: { x: number; y: number; w: number; h: number },
        b: { x: number; y: number; w: number; h: number },
    ) =>
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y;

    const integrate = (s: State, dt: number) => ({
        birdVy: s.birdVy + Constants.GRAVITY * dt,
        birdY: s.birdY + (s.birdVy + Constants.GRAVITY * dt) * dt,
    });

    // only clamp when game not over
    const clampAlive = (y: number, vy: number, TOP: number, GROUND: number) => {
        if (y >= GROUND) return { y: GROUND, vy: 0 };
        if (y <= TOP) return { y: TOP, vy: 0 };
        return { y, vy };
    };

    const spawnDue = (
        defs: ReadonlyArray<PipeDef>,
        elapsed: number,
        nextId: number,
    ) => {
        const due = defs.filter(d => d.time <= elapsed);
        const future = defs.slice(due.length);
        const spawned = due.map((d, i) => ({
            id: nextId + i,
            x: Viewport.CANVAS_WIDTH,
            gapY: d.gapYpx,
            gapH: d.gapHpx,
        }));
        return { spawned, future };
    };

    const movePipes = (pipes: ReadonlyArray<Pipe>, dt: number) =>
        pipes
            .map(p => ({ ...p, x: p.x - Constants.PIPE_SPEED * dt }))
            .filter(p => p.x + Constants.PIPE_WIDTH >= 0);

    const collide = (
        birdBox: { x: number; y: number; w: number; h: number },
        pipes: ReadonlyArray<Pipe>,
        r: number,
    ) => {
        const bumpDown = 150 + r * 200,
            bumpUp = 250 + r * 170;
        for (const p of pipes) {
            const half = p.gapH / 2,
                topH = Math.max(0, p.gapY - half);
            const botY = Math.min(Viewport.CANVAS_HEIGHT, p.gapY + half);
            const topR = { x: p.x, y: 0, w: Constants.PIPE_WIDTH, h: topH };
            const botR = {
                x: p.x,
                y: botY,
                w: Constants.PIPE_WIDTH,
                h: Viewport.CANVAS_HEIGHT - botY,
            };
            if (overlaps(birdBox, topR))
                return { hit: true, vy: bumpDown, y: birdBox.y };
            if (overlaps(birdBox, botR))
                return { hit: true, vy: -bumpUp, y: birdBox.y };
        }
        return { hit: false, vy: birdBox.y, y: birdBox.y };
    };
    // keeps tracking of number of pipes passed (score)
    const scorePasses = (
        pipes: ReadonlyArray<Pipe>,
        birdRight: number,
        scoredIds: ReadonlyArray<number>,
    ) => {
        const newly = pipes
            .filter(
                p =>
                    p.x + Constants.PIPE_WIDTH < birdRight &&
                    !scoredIds.includes(p.id),
            )
            .map(p => p.id);
        return { newly, scoreDelta: newly.length };
    };

    // physics reducer
    const stepReducer =
        (dt: number, r: number) =>
        (s: State): State => {
            // keep falling after game end (no clamping)
            if (s.gameEnd) {
                const birdVy = s.birdVy + Constants.GRAVITY * dt;
                const birdY = s.birdY + birdVy * dt;
                return { ...s, birdVy, birdY, flapCooldown: 0 };
            }

            // pause until first click
            if (!s.started) return s;

            // timers/cooldowns
            const elapsed = s.elapsed + dt;
            const hurtCooldown = Math.max(0, s.hurtCooldown - dt);
            const flapCooldown = Math.max(0, s.flapCooldown - dt);

            // spawn & move pipes
            const [due, future] = partition(
                s.remainingDefs,
                d => d.time <= elapsed,
            );
            const spawned: ReadonlyArray<Pipe> = due.map((d, i) => ({
                id: s.nextPipeId + i,
                x: Viewport.CANVAS_WIDTH,
                gapY: d.gapYpx,
                gapH: d.gapHpx,
            }));
            const pipes = s.pipes
                .concat(spawned)
                .map(p => ({ ...p, x: p.x - Constants.PIPE_SPEED * dt }))
                .filter(p => p.x + Constants.PIPE_WIDTH >= 0);

            // integrate then clamp while alive
            const vy0 = s.birdVy + Constants.GRAVITY * dt;
            const y0 = s.birdY + vy0 * dt;
            const yClamped = y0 >= GROUND ? GROUND : y0 <= TOP ? TOP : y0;
            const vyClamped = y0 <= TOP || y0 >= GROUND ? 0 : vy0;

            // edge bumps
            const bumpDown = 150 + r * 200;
            const bumpUp = 250 + r * 170;
            const hitTop = yClamped <= TOP;
            const hitGround = yClamped >= GROUND;
            const birdVy1 = hitTop ? bumpDown : hitGround ? -bumpUp : vyClamped;
            const birdY1 = hitGround ? GROUND : yClamped;

            // pipe collision
            const overlaps = (
                a: { x: number; y: number; w: number; h: number },
                b: { x: number; y: number; w: number; h: number },
            ) =>
                a.x < b.x + b.w &&
                a.x + a.w > b.x &&
                a.y < b.y + b.h &&
                a.y + a.h > b.y;

            type HitDir = "none" | "top" | "bottom";
            const birdBox = {
                x: birdX,
                y: birdY1,
                w: Birb.WIDTH,
                h: Birb.HEIGHT,
            };
            const pipeHit: HitDir = (() => {
                for (const p of pipes) {
                    const half = p.gapH / 2;
                    const topH = Math.max(0, p.gapY - half);
                    const botY = Math.min(
                        Viewport.CANVAS_HEIGHT,
                        p.gapY + half,
                    );
                    const topR = {
                        x: p.x,
                        y: 0,
                        w: Constants.PIPE_WIDTH,
                        h: topH,
                    };
                    const botR = {
                        x: p.x,
                        y: botY,
                        w: Constants.PIPE_WIDTH,
                        h: Viewport.CANVAS_HEIGHT - botY,
                    };
                    if (overlaps(birdBox, topR)) return "top";
                    if (overlaps(birdBox, botR)) return "bottom";
                }
                return "none";
            })();

            // apply pipe bump (if any)
            const birdVy2 =
                pipeHit === "top"
                    ? bumpDown
                    : pipeHit === "bottom"
                      ? -bumpUp
                      : birdVy1;
            const birdY2 = birdY1;

            // was there any hit this frame?
            const hitThisFrame = hitTop || hitGround || pipeHit !== "none";

            // lives & end condition
            const lives =
                hitThisFrame && hurtCooldown <= 0
                    ? Math.max(0, s.lives - 1)
                    : s.lives;
            const levelComplete = future.length === 0 && pipes.length === 0;
            const gameEnd = lives <= 0 || levelComplete;

            // scoring (passed pipes)
            const birdRight = birdX + Birb.WIDTH;
            const newlyPassed = pipes
                .filter(
                    p =>
                        p.x + Constants.PIPE_WIDTH < birdRight &&
                        !s.scoredIds.includes(p.id),
                )
                .map(p => p.id);
            const scoredIds = newlyPassed.length
                ? s.scoredIds.concat(newlyPassed)
                : s.scoredIds;
            const score = s.score + newlyPassed.length;

            // next state
            return {
                ...s,
                elapsed,
                flapCooldown,
                remainingDefs: future,
                pipes,
                birdY: birdY2,
                birdVy: birdVy2,
                lives,
                score,
                scoredIds,
                nextPipeId: s.nextPipeId + due.length,
                hurtCooldown:
                    hitThisFrame && hurtCooldown <= 0 && !gameEnd
                        ? 0.6
                        : hurtCooldown,
                gameEnd,
            };
        };

    // one run
    const runOnce$ = defer(() => {
        // per run start click
        const startClick$ = merge(
            fromEvent<MouseEvent>(document, "mousedown"),
            fromEvent<TouchEvent>(document, "touchstart"),
        ).pipe(take(1), share());

        // reducer will not until started
        const dtForRun$ = interval(Constants.TICK_RATE_MS).pipe(
            map(() => Constants.TICK_RATE_MS / 1000),
            share(),
        );
        // RNG tied to dt
        const randomForRun$ = dtForRun$.pipe(
            scan(seed => randStep(seed).nextSeed, 0xc0ffee),
            map(seed => randStep(seed).value),
        );

        // reducers
        const resetReducer$ = of(
            (_: State): State => ({
                ...initialState,
                elapsed: 0,
                remainingDefs: pipeDefs,
                ghostYs: [],
                started: false,
            }),
        );

        const startReducer$ = startClick$.pipe(
            map(
                () =>
                    (s: State): State => ({ ...s, started: true }),
            ),
        );

        const tickForRun$ = dtForRun$.pipe(
            withLatestFrom(randomForRun$),
            map(([dt, r]) => stepReducer(dt, r)),
        );

        const flapForRun$ = startClick$.pipe(switchMap(() => rawFlap$));

        // after first click start ghosts
        const ghostPlaybackReducerForRun$ = startClick$.pipe(
            switchMap(() =>
                ghostFramesAll$.pipe(
                    // snapshot the catalog at the moment this run begins
                    take(1),
                    switchMap(framesList => {
                        if (framesList.length === 0) return EMPTY;
                        const tick$ = dtForRun$.pipe(share());
                        const idx$ = tick$.pipe(scan(i => i + 1, -1));

                        // one reducer per frame set ghostYs from the snapshots
                        return idx$.pipe(
                            map(i => {
                                const idx = Math.max(0, i);
                                const ys = framesList.map(
                                    fr => fr[Math.min(idx, fr.length - 1)],
                                );
                                return (s: State): State => ({
                                    ...s,
                                    ghostYs: ys,
                                });
                            }),
                        );
                    }),
                ),
            ),
        );

        // build one run and merge all reducers into a single scan
        const reducersForRun$ = merge(
            resetReducer$,
            startReducer$,
            tickForRun$,
            flapForRun$,
            ghostPlaybackReducerForRun$,
        );

        // builds the raw run stream
        const runBaseRaw$ = reducersForRun$.pipe(
            scan((s, reduce) => reduce(s), initialState),
            share(),
        );

        // detects when the game has ended
        const gameOver$ = runBaseRaw$.pipe(
            filter(s => s.gameEnd),
            take(1),
        );

        // only allows R to end the run after gameover
        const endOnRestartAfterOver$ = gameOver$.pipe(
            switchMap(() => restartKey$.pipe(take(1))),
        );

        // final run stream
        const runBase$ = runBaseRaw$.pipe(
            takeUntil(endOnRestartAfterOver$),
            share(),
        );

        // record this run
        const thisRunRecording$ = dtForRun$.pipe(
            // ensure completion for finalize
            takeUntil(endOnRestartAfterOver$),
            // tick stream
            withLatestFrom(runBase$),
            map(([, s]) => s),
            // ignore clicks before start
            filter(s => s.started),
            map(s => s.birdY),
            shareReplay({ bufferSize: Infinity, refCount: false }),
        );

        // keep recorder subscribed but emit nothing
        const keepRecorderHot$ = thisRunRecording$.pipe(ignoreElements());

        // frozen recording when the run completes
        return merge(keepRecorderHot$, runBase$).pipe(
            finalize(() => {
                thisRunRecording$.pipe(toArray(), take(1)).subscribe(frames => {
                    const prev = ghostFramesAll$.getValue();
                    // append immutable snapshot
                    ghostFramesAll$.next(prev.concat([frames]));
                });
            }),
        );
    });
    return runOnce$.pipe(repeat());
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
