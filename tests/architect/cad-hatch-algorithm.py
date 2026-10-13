"""Pure-Python regression for the scanline hatch math emitted by cad-agent.ts.

Keep scanline selection and half-open edge intersections in sync with
compileCadCommands._hatch_polygon. This test needs Python only; it does not
install or import FreeCAD.
"""

import math
import unittest


def hatch_segments(points, spacing, angle):
    """Return hatch segments for a closed polygon represented by (x, y) pairs."""
    radians = math.radians(angle)
    dx, dy = math.cos(radians), math.sin(radians)
    nx, ny = -dy, dx
    projections = [x * nx + y * ny for x, y in points]
    pmin, pmax = min(projections), max(projections)
    span = pmax - pmin
    if span <= 1:
        return []
    phase = pmin + spacing / 2.0
    if phase >= pmax:
        phase = (pmin + pmax) / 2.0
    hi = math.floor((pmax - phase) / spacing)
    if hi > 500:
        raise ValueError("density limit")

    segments = []
    for k in range(hi + 1):
        t = phase + k * spacing
        hits = []
        for i, p in enumerate(points):
            q = points[(i + 1) % len(points)]
            u, v = p[0] * nx + p[1] * ny, q[0] * nx + q[1] * ny
            if (u <= t < v) or (v <= t < u):
                fraction = (t - u) / (v - u)
                x = p[0] + fraction * (q[0] - p[0])
                y = p[1] + fraction * (q[1] - p[1])
                hits.append((x * dx + y * dy, x, y))
        hits.sort(key=lambda hit: hit[0])
        if len(hits) % 2:
            hits = hits[:-1]
        for i in range(0, len(hits) - 1, 2):
            start, end = hits[i], hits[i + 1]
            if math.hypot(end[1] - start[1], end[2] - start[2]) > 1:
                segments.append(((start[1], start[2]), (end[1], end[2])))
    return segments


def wall_band(start, end, half_width):
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy)
    ux, uy = dx / length, dy / length
    nx, ny = -uy, ux
    return [
        (start[0] + nx * half_width, start[1] + ny * half_width),
        (end[0] + nx * half_width, end[1] + ny * half_width),
        (end[0] - nx * half_width, end[1] - ny * half_width),
        (start[0] - nx * half_width, start[1] - ny * half_width),
    ]


def wall_polygons(start, end, thickness, openings=()):
    """Rebuild wall strips from semantic endpoints and opening intervals."""
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy)
    ux, uy = dx / length, dy / length
    nx, ny, half = -uy, ux, thickness / 2.0
    pieces, cursor = [], 0.0
    for offset, width in sorted(openings):
        if offset - cursor >= 50:
            pieces.append((cursor, offset))
        cursor = offset + width
    if length - cursor >= 50:
        pieces.append((cursor, length))
    polygons = []
    for lo, hi in pieces:
        x0, y0 = start[0] + ux * lo, start[1] + uy * lo
        x1, y1 = start[0] + ux * hi, start[1] + uy * hi
        polygons.append([
            (x0 + nx * half, y0 + ny * half),
            (x1 + nx * half, y1 + ny * half),
            (x1 - nx * half, y1 - ny * half),
            (x0 - nx * half, y0 - ny * half),
        ])
    return polygons


class HatchAlgorithmTests(unittest.TestCase):
    def test_rebuilt_wall_bounds_are_stable_for_axis_and_rotated_walls(self):
        cases = [
            ((2000, 2000), (18000, 2000), (2000, 1900, 18000, 2100)),
            ((2000, 2000), (2000, 18000), (1900, 2000, 2100, 18000)),
            ((2000, 2000), (10000, 10000), (2000 - 100 / math.sqrt(2), 2000 - 100 / math.sqrt(2), 10000 + 100 / math.sqrt(2), 10000 + 100 / math.sqrt(2))),
        ]
        for start, end, expected in cases:
            with self.subTest(start=start, end=end):
                points = wall_polygons(start, end, 200)[0]
                actual = (min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points))
                for found, wanted in zip(actual, expected):
                    self.assertAlmostEqual(found, wanted, places=6)

    def test_rebuilt_wall_preserves_opening_gap_and_remaining_segments(self):
        polygons = wall_polygons((2000, 2000), (18000, 2000), 200, [(5000, 900), (12000, 1200)])
        self.assertEqual(len(polygons), 3)
        self.assertAlmostEqual(max(p[0] for p in polygons[0]), 7000)
        self.assertAlmostEqual(min(p[0] for p in polygons[1]), 7900)
        self.assertAlmostEqual(max(p[0] for p in polygons[1]), 14000)
        self.assertAlmostEqual(min(p[0] for p in polygons[2]), 15200)

    def test_thin_wall_band_gets_interior_stroke_for_parallel_hatch(self):
        # Exactly the production failure shape: y=100 +/- 100, spacing 500.
        segments = hatch_segments(wall_band((100, 100), (9900, 100), 100), 500, 0)
        self.assertGreaterEqual(len(segments), 1)
        self.assertTrue(all(abs(a[1] - 100) < 1e-6 and abs(b[1] - 100) < 1e-6 for a, b in segments))

    def test_rotated_wall_and_segments_around_opening_both_hatch(self):
        angle = math.radians(37)
        direction = (math.cos(angle), math.sin(angle))
        origin = (8000, 8000)

        def point_at(distance):
            return (origin[0] + direction[0] * distance, origin[1] + direction[1] * distance)

        pieces = [wall_band(point_at(0), point_at(1700), 125), wall_band(point_at(2600), point_at(8000), 125)]
        segments = [segment for polygon in pieces for segment in hatch_segments(polygon, 500, 45)]
        self.assertGreaterEqual(len(segments), 2)

    def test_interior_scanlines_work_for_closed_rectangle_under_rotations(self):
        base = [(1000, 1000), (7000, 1000), (7000, 5000), (1000, 5000)]
        for angle in (0, 17, 45, 90, 137):
            radians = math.radians(angle)
            rotated = [
                (4000 + (x - 4000) * math.cos(radians) - (y - 3000) * math.sin(radians),
                 3000 + (x - 4000) * math.sin(radians) + (y - 3000) * math.cos(radians))
                for x, y in base
            ]
            with self.subTest(angle=angle):
                self.assertTrue(hatch_segments(rotated, 400, 29))

    def test_degenerate_projection_returns_no_strokes(self):
        self.assertEqual(hatch_segments([(0, 0), (100, 0), (200, 0)], 400, 0), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
