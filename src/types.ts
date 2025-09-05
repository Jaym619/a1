export interface Bird {
  x: number;
  y: number;
  velocity: number;
}

export interface Pipe {
  x: number;
  gapY: number;
  gapHeight: number;
}

export interface GameState {
  bird: Bird;
  pipes: Pipe[];
  score: number;
  lives: number;
  gameEnd: boolean;
}
