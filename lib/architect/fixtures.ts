import type { ProjectGeometry } from "./geometry";
import { GEOMETRY_MODEL_VERSION } from "./geometry";

/**
 * Manually authored residential floor fixture for testing the deterministic
 * Architect Engine slice. This is FIXED TEST DATA — not an AI-generated layout.
 *
 * Site: rectangle 12 m wide (X: 0..12) × 20 m deep (Y: 0..20).
 * Walls are SPLIT AT EVERY JUNCTION so each wall segment is referenced only
 * by the spaces whose boundary it actually forms, in full. Perimeters are
 * therefore exact sums of referenced wall lengths:
 *   Unit A (9×10):  10 + 9 + 10 + 6 + 3 = 38 m
 *   Core   (3×10):   3 + 10 + 3 + 10    = 26 m
 *   Unit B (12×10):  6 + 6 + 10 + 3 + 3 + 6 + 10 = 44 m
 *
 *   y=20 ┌───────────────┬──────┐
 *        │               │      │
 *        │  Unit A       │Stair │
 *        │  (9x10)       │Core  │
 *   y=10 ├───────┬───────┼──────┤
 *        │       │       │door B│
 *        │  Unit B (12x10) │      │
 *   y=0  └──────────────────────┘
 *        x=0                   x=12
 *
 * Access: Unit A reaches the core through a door on the shared vertical wall
 * (wall-core-west); Unit B reaches the core through a door on mid-east (the
 * shared y=10 segment x=9..12); the core holds the exterior entrance on the
 * north-east wall. Both units are therefore accessed through the shared core.
 */

export const FIXTURE_IDS = {
  site: "site-01",
  floor: "floor-01",
  spaceA: "space-unit-a",
  spaceB: "space-unit-b",
  spaceCore: "space-core",
  // Perimeter walls, split at junctions.
  wallSouthWest: "wall-south-west",
  wallSouthEast: "wall-south-east",
  wallNorthWest: "wall-north-west",
  wallNorthEast: "wall-north-east",
  wallWestLower: "wall-west-lower",
  wallWestUpper: "wall-west-upper",
  wallEastLower: "wall-east-lower",
  wallEastUpper: "wall-east-upper",
  // Interior walls, split at junctions.
  wallMidWest: "wall-mid-west",
  wallMidCenter: "wall-mid-center",
  wallMidEast: "wall-mid-east",
  wallCoreWest: "wall-core-west",
  // Openings.
  doorA: "door-unit-a-core",
  doorB: "door-unit-b-core",
  doorCoreEntry: "door-core-entry",
  windowA: "window-unit-a-north",
  windowB1: "window-unit-b-west",
  windowB2: "window-unit-b-south",
} as const;

/** Builds the canonical valid fixture. Fresh arrays each call (no shared mutation). */
export function buildResidentialFloorFixture(): ProjectGeometry {
  return {
    schemaVersion: GEOMETRY_MODEL_VERSION,
    units: "meters",
    site: {
      id: FIXTURE_IDS.site,
      polygon: {
        points: [
          { x: 0, y: 0 },
          { x: 12, y: 0 },
          { x: 12, y: 20 },
          { x: 0, y: 20 },
        ],
      },
    },
    floor: {
      id: FIXTURE_IDS.floor,
      name: "Ground floor",
      elevation: 0,
      spaceIds: [FIXTURE_IDS.spaceA, FIXTURE_IDS.spaceCore, FIXTURE_IDS.spaceB],
    },
    spaces: [
      {
        id: FIXTURE_IDS.spaceA,
        name: "Unit A — living floor",
        // Unit A: (0,10)-(9,10)-(9,20)-(0,20). Bottom edge x=0..9 at y=10 is
        // mid-west + mid-center; the x=9..12 stretch at y=10 does NOT bound
        // Unit A (the core sits above it).
        wallIds: [
          FIXTURE_IDS.wallWestUpper,
          FIXTURE_IDS.wallNorthWest,
          FIXTURE_IDS.wallCoreWest,
          FIXTURE_IDS.wallMidWest,
          FIXTURE_IDS.wallMidCenter,
        ],
        polygon: {
          points: [
            { x: 0, y: 10 },
            { x: 9, y: 10 },
            { x: 9, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      },
      {
        id: FIXTURE_IDS.spaceCore,
        name: "Stair and services core",
        // Core: (9,10)-(12,10)-(12,20)-(9,20). Bottom edge x=9..12 at y=10 is
        // mid-east, shared with Unit B below it.
        wallIds: [
          FIXTURE_IDS.wallNorthEast,
          FIXTURE_IDS.wallEastUpper,
          FIXTURE_IDS.wallMidEast,
          FIXTURE_IDS.wallCoreWest,
        ],
        polygon: {
          points: [
            { x: 9, y: 10 },
            { x: 12, y: 10 },
            { x: 12, y: 20 },
            { x: 9, y: 20 },
          ],
        },
      },
      {
        id: FIXTURE_IDS.spaceB,
        name: "Unit B — full-width apartment",
        // Unit B: (0,0)-(12,0)-(12,10)-(0,10). Top edge x=0..12 at y=10 is
        // mid-west + mid-center (Unit A above) + mid-east (core above).
        wallIds: [
          FIXTURE_IDS.wallSouthWest,
          FIXTURE_IDS.wallSouthEast,
          FIXTURE_IDS.wallEastLower,
          FIXTURE_IDS.wallMidEast,
          FIXTURE_IDS.wallMidCenter,
          FIXTURE_IDS.wallMidWest,
          FIXTURE_IDS.wallWestLower,
        ],
        polygon: {
          points: [
            { x: 0, y: 0 },
            { x: 12, y: 0 },
            { x: 12, y: 10 },
            { x: 0, y: 10 },
          ],
        },
      },
    ],
    walls: [
      // South wall y=0, split at x=6.
      { id: FIXTURE_IDS.wallSouthWest, start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, thickness: 0.25, sharedWith: [FIXTURE_IDS.spaceB] },
      { id: FIXTURE_IDS.wallSouthEast, start: { x: 6, y: 0 }, end: { x: 12, y: 0 }, thickness: 0.25, sharedWith: [FIXTURE_IDS.spaceB] },
      // North wall y=20, split at x=9 (Unit A | core).
      { id: FIXTURE_IDS.wallNorthWest, start: { x: 0, y: 20 }, end: { x: 9, y: 20 }, thickness: 0.25, sharedWith: [FIXTURE_IDS.spaceA] },
      { id: FIXTURE_IDS.wallNorthEast, start: { x: 9, y: 20 }, end: { x: 12, y: 20 }, thickness: 0.25, sharedWith: [FIXTURE_IDS.spaceCore] },
      // West wall x=0, split at y=10 (Unit B | Unit A).
      { id: FIXTURE_IDS.wallWestLower, start: { x: 0, y: 0 }, end: { x: 0, y: 10 }, thickness: 0.25, sharedWith: [FIXTURE_IDS.spaceB] },
      { id: FIXTURE_IDS.wallWestUpper, start: { x: 0, y: 10 }, end: { x: 0, y: 20 }, thickness: 0.25, sharedWith: [FIXTURE_IDS.spaceA] },
      // East wall x=12, split at y=10 (Unit B | core).
      { id: FIXTURE_IDS.wallEastLower, start: { x: 12, y: 0 }, end: { x: 12, y: 10 }, thickness: 0.25, sharedWith: [FIXTURE_IDS.spaceB] },
      { id: FIXTURE_IDS.wallEastUpper, start: { x: 12, y: 10 }, end: { x: 12, y: 20 }, thickness: 0.25, sharedWith: [FIXTURE_IDS.spaceCore] },
      // Interior mid wall y=10, split at x=6 and x=9.
      { id: FIXTURE_IDS.wallMidWest, start: { x: 0, y: 10 }, end: { x: 6, y: 10 }, thickness: 0.2, sharedWith: [FIXTURE_IDS.spaceB, FIXTURE_IDS.spaceA] },
      { id: FIXTURE_IDS.wallMidCenter, start: { x: 6, y: 10 }, end: { x: 9, y: 10 }, thickness: 0.2, sharedWith: [FIXTURE_IDS.spaceB, FIXTURE_IDS.spaceA] },
      { id: FIXTURE_IDS.wallMidEast, start: { x: 9, y: 10 }, end: { x: 12, y: 10 }, thickness: 0.2, sharedWith: [FIXTURE_IDS.spaceB, FIXTURE_IDS.spaceCore] },
      // Vertical interior wall between Unit A and core, x=9, y=10..20.
      { id: FIXTURE_IDS.wallCoreWest, start: { x: 9, y: 10 }, end: { x: 9, y: 20 }, thickness: 0.2, sharedWith: [FIXTURE_IDS.spaceA, FIXTURE_IDS.spaceCore] },
    ],
    openings: [
      // Unit A -> core door on the shared vertical wall (span 10 m).
      { id: FIXTURE_IDS.doorA, kind: "door", wallId: FIXTURE_IDS.wallCoreWest, offset: 4.0, width: 1.0 },
      // Unit B -> core door on mid-east (span 3 m), shared with the core above.
      { id: FIXTURE_IDS.doorB, kind: "door", wallId: FIXTURE_IDS.wallMidEast, offset: 1.0, width: 1.0 },
      // Exterior entrance through the core on the north-east wall (span 3 m).
      { id: FIXTURE_IDS.doorCoreEntry, kind: "door", wallId: FIXTURE_IDS.wallNorthEast, offset: 1.0, width: 1.0 },
      // Windows.
      { id: FIXTURE_IDS.windowA, kind: "window", wallId: FIXTURE_IDS.wallNorthWest, offset: 2.0, width: 2.4 },
      { id: FIXTURE_IDS.windowB1, kind: "window", wallId: FIXTURE_IDS.wallWestLower, offset: 3.0, width: 1.8 },
      { id: FIXTURE_IDS.windowB2, kind: "window", wallId: FIXTURE_IDS.wallSouthEast, offset: 1.0, width: 2.0 },
    ],
  };
}
