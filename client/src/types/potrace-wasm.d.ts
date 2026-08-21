declare module "potrace-wasm" {
  export function loadFromCanvas(canvas: HTMLCanvasElement): Promise<string>;
}
