import { GameState } from "./types";

const svg = document.querySelector("#svgCanvas") as SVGSVGElement;

export function render(state: GameState) {
  if (!svg) return;

  svg.innerHTML = ""; // clear frame

  // Draw bird
  const bird = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  bird.setAttribute("cx", state.bird.x.toString());
  bird.setAttribute("cy", state.bird.y.toString());
  bird.setAttribute("r", "10");
  bird.setAttribute("fill", "yellow");

  svg.appendChild(bird);
}
