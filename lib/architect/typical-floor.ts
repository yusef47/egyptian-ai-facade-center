import { parseConceptProposal, type ConceptProposal } from "./concept-proposal";
import type { BuildingProposal } from "./building-proposal";

/** Expand one authored residential floor into a bounded concept stack. */
export function expandTypicalFloor(
  rawPlan: unknown,
  rawCoreCellId: unknown,
  rawFloorCount: unknown,
): BuildingProposal | null {
  const plan = parseConceptProposal(rawPlan);
  if (!plan || typeof rawCoreCellId !== "string" || !Number.isInteger(rawFloorCount)
    || (rawFloorCount as number) < 2 || (rawFloorCount as number) > 5) return null;
  const core = plan.cells.find((cell) => cell.id === rawCoreCellId);
  if (!core || (core.kind !== "core" && core.kind !== "stair")) return null;
  if (!plan.doors.some((door) => door.from === rawCoreCellId && door.to === "outside")) return null;
  // Every upper floor uses its aligned core as the access root. Remove the
  // ground entrance there rather than creating fictional doors to outdoors.
  const upperPlan: ConceptProposal = {
    ...plan,
    doors: plan.doors.filter((door) => door.to !== "outside"),
  };
  const names = ["Ground", "First", "Second", "Third", "Fourth"];
  const ids = ["ground", "first", "second", "third", "fourth"];
  return {
    kind: "building",
    version: 1,
    coreCellId: rawCoreCellId,
    floors: Array.from({ length: rawFloorCount as number }, (_, index) => ({
      id: ids[index]!,
      name: names[index]!,
      elevation: Math.round(index * 3.2 * 1000) / 1000,
      plan: index === 0 ? plan : upperPlan,
    })),
  };
}
