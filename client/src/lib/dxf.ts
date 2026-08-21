export type SvgDxfOptions = {
  width: number;
  height: number;
  scale?: number;
};

type Point = { x: number; y: number };
type Segment = { start: Point; end: Point; length: number };
type Path = { points: Point[]; closed: boolean };
type PathToken = { kind: "command"; value: string } | { kind: "number"; value: number };
type PotraceApi = {
  loadFromCanvas?: (canvas: HTMLCanvasElement) => Promise<string>;
  default?: { loadFromCanvas?: (canvas: HTMLCanvasElement) => Promise<string> };
};

const BASE_MIN_SEGMENT_LENGTH = 5;
const MAX_LINE_ENTITIES = 5000;
const RDP_EPSILON = 2;

function pointDistanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy));
}

function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  let maxDistance = tolerance;
  let splitIndex = -1;
  const start = points[0];
  const end = points[points.length - 1];
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointDistanceToSegment(points[index], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }
  if (splitIndex < 0) return [start, end];
  return [
    ...simplify(points.slice(0, splitIndex + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(splitIndex), tolerance),
  ];
}

function tokenizePathData(data: string): PathToken[] {
  const tokens: PathToken[] = [];
  const tokenPattern = /([a-zA-Z])|([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(data)) !== null) {
    if (match[1]) tokens.push({ kind: "command", value: match[1] });
    else if (match[2]) tokens.push({ kind: "number", value: Number(match[2]) });
  }
  return tokens;
}

function flattenCubic(start: Point, control1: Point, control2: Point, end: Point): Point[] {
  const points: Point[] = [];
  const subdivisions = 12;
  for (let step = 1; step <= subdivisions; step += 1) {
    const t = step / subdivisions;
    const inverse = 1 - t;
    points.push({
      x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * control1.x + 3 * inverse * t ** 2 * control2.x + t ** 3 * end.x,
      y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * control1.y + 3 * inverse * t ** 2 * control2.y + t ** 3 * end.y,
    });
  }
  return points;
}

function flattenQuadratic(start: Point, control: Point, end: Point): Point[] {
  const points: Point[] = [];
  const subdivisions = 8;
  for (let step = 1; step <= subdivisions; step += 1) {
    const t = step / subdivisions;
    const inverse = 1 - t;
    points.push({
      x: inverse ** 2 * start.x + 2 * inverse * t * control.x + t ** 2 * end.x,
      y: inverse ** 2 * start.y + 2 * inverse * t * control.y + t ** 2 * end.y,
    });
  }
  return points;
}

function parsePathData(data: string): Path[] {
  const tokens = tokenizePathData(data);
  const paths: Path[] = [];
  let tokenIndex = 0;
  let command = "";
  let current: Point = { x: 0, y: 0 };
  let subpathStart: Point = { x: 0, y: 0 };
  let activePath: Path | null = null;

  const ensurePath = (point: Point) => {
    if (!activePath) {
      activePath = { points: [point], closed: false };
      paths.push(activePath);
      subpathStart = point;
    }
  };
  const readNumber = (): number => {
    const token = tokens[tokenIndex];
    if (!token || token.kind !== "number") throw new Error("Malformed Potrace path data");
    tokenIndex += 1;
    return token.value;
  };
  const readPoint = (relative: boolean): Point => {
    const point = { x: readNumber(), y: readNumber() };
    return relative ? { x: current.x + point.x, y: current.y + point.y } : point;
  };

  while (tokenIndex < tokens.length) {
    const token = tokens[tokenIndex];
    if (token.kind === "command") {
      command = token.value;
      tokenIndex += 1;
      if (command.toLowerCase() === "z") {
        if (activePath) {
          activePath.closed = true;
          current = subpathStart;
        }
        command = "";
      }
      continue;
    }
    if (!command) throw new Error("Potrace path data is missing a command");

    const relative = command === command.toLowerCase();
    switch (command.toUpperCase()) {
      case "M": {
        const point = readPoint(relative);
        activePath = { points: [point], closed: false };
        paths.push(activePath);
        current = point;
        subpathStart = point;
        command = relative ? "l" : "L";
        break;
      }
      case "L": {
        const point = readPoint(relative);
        ensurePath(current);
        activePath?.points.push(point);
        current = point;
        break;
      }
      case "H": {
        const x = readNumber();
        const point = { x: relative ? current.x + x : x, y: current.y };
        ensurePath(current);
        activePath?.points.push(point);
        current = point;
        break;
      }
      case "V": {
        const y = readNumber();
        const point = { x: current.x, y: relative ? current.y + y : y };
        ensurePath(current);
        activePath?.points.push(point);
        current = point;
        break;
      }
      case "C": {
        const control1 = readPoint(relative);
        const control2 = readPoint(relative);
        const end = readPoint(relative);
        ensurePath(current);
        activePath?.points.push(...flattenCubic(current, control1, control2, end));
        current = end;
        break;
      }
      case "Q": {
        const control = readPoint(relative);
        const end = readPoint(relative);
        ensurePath(current);
        activePath?.points.push(...flattenQuadratic(current, control, end));
        current = end;
        break;
      }
      default:
        throw new Error(`Unsupported Potrace path command: ${command}`);
    }
  }
  return paths;
}

function extractPaths(svg: string): Path[] {
  const paths: Path[] = [];
  const pathPattern = /<path\b[^>]*\bd\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pathPattern.exec(svg)) !== null) {
    paths.push(...parsePathData(match[1] ?? match[2] ?? ""));
  }
  return paths.map((path) => {
    const points = simplify(path.points, RDP_EPSILON);
    if (path.closed && points.length > 1 && points[0].x === points.at(-1)?.x && points[0].y === points.at(-1)?.y) {
      points.pop();
    }
    return { points, closed: path.closed };
  }).filter((path) => path.points.length >= 2);
}

function collectSegments(paths: Path[]): Segment[] {
  const segments: Segment[] = [];
  for (const path of paths) {
    const segmentCount = path.closed ? path.points.length : path.points.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const start = path.points[index];
      const end = path.points[(index + 1) % path.points.length];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      if (length >= BASE_MIN_SEGMENT_LENGTH) segments.push({ start, end, length });
    }
  }
  return segments;
}

const fmtCode = (code: number) => code.toString().padStart(3, " ");

function formatPairs(rawPairs: readonly string[]): string[] {
  if (rawPairs.length % 2 !== 0) throw new Error("DXF pair list is incomplete");
  const formatted: string[] = [];
  for (let index = 0; index < rawPairs.length; index += 2) {
    const code = Number(rawPairs[index]);
    if (!Number.isInteger(code)) throw new Error("DXF group code is invalid");
    formatted.push(fmtCode(code), rawPairs[index + 1]);
  }
  return formatted;
}

function dxfHeader(width: number, height: number, scale: number): string[] {
  return formatPairs([
    "0", "SECTION", "2", "HEADER",
    "9", "$ACADVER", "1", "AC1009",
    "9", "$EXTMIN", "10", "0.0", "20", "0.0",
    "9", "$EXTMAX", "10", (width * scale).toFixed(1), "20", (height * scale).toFixed(1),
    "0", "ENDSEC",
  ]);
}

function dxfTables(): string[] {
  return formatPairs([
    "0", "SECTION", "2", "TABLES",
    "0", "TABLE", "2", "LTYPE", "70", "1",
    "0", "LTYPE", "2", "CONTINUOUS", "70", "0", "3", "Solid line", "72", "65", "73", "0", "40", "0.0",
    "0", "ENDTAB",
    "0", "TABLE", "2", "LAYER", "70", "1",
    "0", "LAYER", "2", "0", "70", "0", "62", "7", "6", "CONTINUOUS",
    "0", "ENDTAB",
    "0", "ENDSEC",
  ]);
}

function serializeSegments(segments: Segment[], options: SvgDxfOptions): string {
  const scale = Number.isFinite(options.scale) && (options.scale ?? 1) > 0 ? options.scale ?? 1 : 1;
  const selected = segments.length > MAX_LINE_ENTITIES
    ? [...segments].sort((a, b) => b.length - a.length).slice(0, MAX_LINE_ENTITIES)
    : segments;
  if (selected.length === 0) throw new Error("No sufficiently long line segments found in traced geometry");

  const lines = [
    ...dxfHeader(options.width, options.height, scale),
    ...dxfTables(),
    ...formatPairs(["0", "SECTION", "2", "ENTITIES"]),
  ];
  for (const { start, end } of selected) {
    lines.push(...formatPairs([
      "0", "LINE",
      "8", "0",
      "10", (start.x * scale).toFixed(1),
      "20", ((options.height - start.y) * scale).toFixed(1),
      "11", (end.x * scale).toFixed(1),
      "21", ((options.height - end.y) * scale).toFixed(1),
    ]));
  }
  lines.push(...formatPairs(["0", "ENDSEC", "0", "EOF"]));
  return `${lines.join("\n")}\n`;
}

/** Converts ordered Potrace SVG paths into the verified AC1009 LINE DXF format. */
export function buildDxfFromSvg(svg: string, options: SvgDxfOptions): string {
  if (!Number.isFinite(options.width) || !Number.isFinite(options.height) || options.width <= 0 || options.height <= 0) {
    throw new Error("Invalid traced geometry dimensions");
  }
  const paths = extractPaths(svg);
  if (paths.length === 0) throw new Error("Potrace SVG contains no usable paths");
  return serializeSegments(collectSegments(paths), options);
}

async function loadPotraceSvg(canvas: HTMLCanvasElement): Promise<string> {
  const module = await import("potrace-wasm") as PotraceApi;
  const loadFromCanvas = module.loadFromCanvas ?? module.default?.loadFromCanvas;
  if (!loadFromCanvas) throw new Error("Potrace-WASM loader is unavailable");
  return loadFromCanvas(canvas);
}

/** Loads a generated image, thresholds it, traces it with Potrace-WASM, and returns DXF. */
export function rasterizeImageToDxf(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined" || typeof document === "undefined") {
      reject(new Error("Browser image APIs are unavailable"));
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      void (async () => {
        try {
          const width = image.naturalWidth || image.width;
          const height = image.naturalHeight || image.height;
          if (!width || !height) throw new Error("Generated image has no dimensions");

          const sourceCanvas = document.createElement("canvas");
          sourceCanvas.width = width;
          sourceCanvas.height = height;
          const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
          if (!sourceContext) throw new Error("Canvas 2D context is unavailable");
          sourceContext.drawImage(image, 0, 0);
          const sourceData = sourceContext.getImageData(0, 0, width, height).data;

          const binaryCanvas = document.createElement("canvas");
          binaryCanvas.width = width;
          binaryCanvas.height = height;
          const binaryContext = binaryCanvas.getContext("2d", { willReadFrequently: true });
          if (!binaryContext) throw new Error("Binary canvas 2D context is unavailable");
          const binaryImage = binaryContext.createImageData(width, height);
          for (let index = 0; index < width * height; index += 1) {
            const sourceOffset = index * 4;
            const targetOffset = sourceOffset;
            const red = sourceData[sourceOffset] ?? 255;
            const green = sourceData[sourceOffset + 1] ?? red;
            const blue = sourceData[sourceOffset + 2] ?? red;
            const isBlack = red * 299 + green * 587 + blue * 114 < 128000;
            const value = isBlack ? 0 : 255;
            binaryImage.data[targetOffset] = value;
            binaryImage.data[targetOffset + 1] = value;
            binaryImage.data[targetOffset + 2] = value;
            binaryImage.data[targetOffset + 3] = 255;
          }
          binaryContext.putImageData(binaryImage, 0, 0);

          const svg = await loadPotraceSvg(binaryCanvas);
          resolve(buildDxfFromSvg(svg, { width, height }));
        } catch (error) {
          reject(error instanceof Error ? error : new Error("Unable to trace generated CAD image"));
        }
      })();
    };
    image.onerror = () => reject(new Error("Unable to load generated CAD image"));
    image.src = imageUrl;
  });
}
