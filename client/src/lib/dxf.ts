export type RasterSource = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

type DxfOptions = {
  threshold?: number;
  maxContours?: number;
  simplifyTolerance?: number;
  scale?: number;
};

type Point = { x: number; y: number };

function luminance(data: Uint8ClampedArray, offset: number): number {
  const red = data[offset] ?? 255;
  const green = data[offset + 1] ?? red;
  const blue = data[offset + 2] ?? red;
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function validateRaster(source: RasterSource): void {
  if (!Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width < 1 || source.height < 1) {
    throw new Error("Invalid raster dimensions");
  }
  if (source.data.length < source.width * source.height * 4) {
    throw new Error("Raster data is incomplete");
  }
}

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

function componentContours(source: RasterSource, threshold: number, maxContours: number): Point[][] {
  const { width, height, data } = source;
  const pixelCount = width * height;
  const dark = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    dark[index] = luminance(data, index * 4) <= threshold ? 1 : 0;
  }

  const visited = new Uint8Array(pixelCount);
  const contours: Point[][] = [];
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ] as const;

  for (let start = 0; start < pixelCount && contours.length < maxContours; start += 1) {
    if (!dark[start] || visited[start]) continue;
    const queue = [start];
    const boundary: Point[] = [];
    visited[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const x = current % width;
      const y = Math.floor(current / width);
      let isBoundary = false;
      for (const [dx, dy] of neighbors) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
          isBoundary = true;
          continue;
        }
        const next = nextY * width + nextX;
        if (dark[next]) {
          if (!visited[next]) {
            visited[next] = 1;
            queue.push(next);
          }
        } else {
          isBoundary = true;
        }
      }
      if (isBoundary) boundary.push({ x, y });
    }

    if (boundary.length < 2) continue;
    const center = boundary.reduce(
      (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
      { x: 0, y: 0 },
    );
    center.x /= boundary.length;
    center.y /= boundary.length;
    boundary.sort(
      (a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x),
    );

    const contour = boundary.map((point) => ({ x: point.x, y: height - point.y }));
    if (contour.length > 2) {
      const simplified = simplify([...contour, { ...contour[0] }], 0.75);
      if (simplified.length > 1 && simplified[0].x === simplified.at(-1)?.x && simplified[0].y === simplified.at(-1)?.y) {
        simplified.pop();
      }
      contours.push(simplified);
    } else {
      contours.push(simplify(contour, 0.75));
    }
  }
  return contours;
}

function dxfHeader(width: number, height: number, scale: number): string[] {
  return [
    "0", "SECTION", "2", "HEADER",
    "9", "$ACADVER", "1", "AC1015",
    "9", "$HANDSEED", "5", "FFFF",
    "9", "$INSUNITS", "70", "0",
    "9", "$EXTMIN", "10", "0.0", "20", "0.0",
    "9", "$EXTMAX", "10", (width * scale).toFixed(3), "20", (height * scale).toFixed(3),
    "0", "ENDSEC",
  ];
}

function dxfTables(): string[] {
  return [
    "0", "SECTION", "2", "TABLES",
    "0", "TABLE", "2", "VPORT", "70", "1",
    "0", "VPORT", "2", "*ACTIVE", "70", "0",
    "10", "0.0", "20", "0.0", "11", "1.0", "21", "1.0",
    "12", "0.0", "22", "0.0", "13", "0.0", "23", "0.0",
    "14", "0.0", "24", "0.0", "15", "0.0", "25", "0.0",
    "16", "0.0", "26", "0.0", "36", "0.0", "37", "0.0",
    "40", "1.0", "41", "1.0", "42", "50.0", "43", "0.0",
    "44", "0.0", "50", "0.0", "51", "0.0", "71", "0",
    "72", "100", "73", "1", "74", "3", "75", "0", "0", "ENDTAB",
    "0", "TABLE", "2", "LTYPE", "70", "1",
    "0", "LTYPE", "2", "CONTINUOUS", "70", "0", "3", "Solid line", "72", "65", "73", "0", "40", "0.0", "0", "ENDTAB",
    "0", "TABLE", "2", "LAYER", "70", "2",
    "0", "LAYER", "2", "0", "70", "0", "62", "7", "6", "CONTINUOUS",
    "0", "LAYER", "2", "CAD_OUTLINE", "70", "0", "62", "7", "6", "CONTINUOUS", "0", "ENDTAB",
    "0", "ENDSEC",
  ];
}

/** Converts an RGBA raster into editable ASCII DXF lightweight polylines. */
export function buildDxfFromRaster(source: RasterSource, options: DxfOptions = {}): string {
  validateRaster(source);
  const threshold = options.threshold ?? 180;
  const maxContours = Math.max(1, Math.floor(options.maxContours ?? 250));
  const tolerance = Math.max(0, options.simplifyTolerance ?? 0.75);
  const scale = Number.isFinite(options.scale) && (options.scale ?? 1) > 0 ? options.scale ?? 1 : 1;
  const contours = componentContours(source, threshold, maxContours)
    .map((contour) => simplify(contour, tolerance))
    .filter((contour) => contour.length >= 2);

  if (contours.length === 0) throw new Error("No dark contours found in raster");

  const lines = [
    ...dxfHeader(source.width, source.height, scale),
    ...dxfTables(),
    "0", "SECTION", "2", "BLOCKS", "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
  ];

  contours.forEach((contour, index) => {
    const handle = (0x100 + index).toString(16).toUpperCase();
    lines.push(
      "0", "LWPOLYLINE",
      "5", handle,
      "100", "AcDbEntity",
      "8", "CAD_OUTLINE",
      "100", "AcDbPolyline",
      "90", String(contour.length),
      "70", contour.length > 2 ? "1" : "0",
    );
    for (const point of contour) {
      lines.push("10", (point.x * scale).toFixed(3), "20", (point.y * scale).toFixed(3));
    }
  });

  lines.push("0", "ENDSEC", "0", "EOF");
  return `${lines.join("\n")}\n`;
}

/** Loads a generated image into a canvas and converts its pixels into DXF. */
export function rasterizeImageToDxf(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined" || typeof document === "undefined") {
      reject(new Error("Browser image APIs are unavailable"));
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        if (!canvas.width || !canvas.height) throw new Error("Generated image has no dimensions");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas 2D context is unavailable");
        context.drawImage(image, 0, 0);
        resolve(buildDxfFromRaster({
          width: canvas.width,
          height: canvas.height,
          data: context.getImageData(0, 0, canvas.width, canvas.height).data,
        }));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Unable to vectorize generated image"));
      }
    };
    image.onerror = () => reject(new Error("Unable to load generated CAD image"));
    image.src = imageUrl;
  });
}
