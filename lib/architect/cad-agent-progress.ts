export type CadProgressSnapshot = {
  projectId: string;
  brief: string;
  siteWidth: number;
  siteDepth: number;
  completedSteps: number;
  counts: Record<string, number>;
  objects: number;
  segments: number;
  qualityFeedback?: string;
};

type CadFeedbackIssue = { dimension: string; severity: string; objectIds: string[]; finding: string; proposedEdit: string };
type CadFeedbackQualityIssue = { code: string; severity: string; ids: string[]; message: string };

/** Keeps the next writer request centered on concrete, ID-grounded repairs under the CAD input limit. */
export function formatCadRepairFeedback(review: {
  verdict: string; summary: string; issues: CadFeedbackIssue[];
  rubric: { dimension: string; status: string; note: string }[];
} | null | undefined, qualityIssues: CadFeedbackQualityIssue[] = [], maxLength = 1450): string {
  const dimensionPriority = ["program", "room_logic", "circulation", "stair", "privacy", "daylight_ventilation", "clearance", "usability"];
  const qualityPriority = ["program_count", "room_labels_missing", "duplicate_opening", "room_inaccessible", "stair_fit", "wet_room_ventilation", "habitable_daylight", "furniture_opening_clearance", "furniture_wall_collision"];
  const lines = ["POST-EXECUTION REPAIR PRIORITIES: Fix existing geometry by its listed IDs before adding anything. Do not add another door if one already serves that entry; use delete/move or edit the existing topology. Accessibility checks are heuristic; inspect the preview and geometry before changing walls."];
  const priority = (issue: CadFeedbackIssue) => /duplicat|extra door|second door/i.test(issue.finding + " " + issue.proposedEdit)
    ? -1
    : dimensionPriority.indexOf(issue.dimension);
  const issues = [...(review?.issues ?? [])].sort((a, b) => Number(b.severity === "blocking") - Number(a.severity === "blocking") || priority(a) - priority(b));
  const clip = (value: string, length: number) => value.length > length ? value.slice(0, length - 1) + "…" : value;
  for (const issue of issues.slice(0, 5)) {
    lines.push("[" + issue.severity.toUpperCase() + " " + issue.dimension + "] IDs=" + (issue.objectIds.join(",") || "none") + "; finding=" + clip(issue.finding, 105) + "; action=" + clip(issue.proposedEdit, 130));
  }
  const quality = [...qualityIssues].sort((a, b) => qualityPriority.indexOf(a.code) - qualityPriority.indexOf(b.code) || Number(b.severity === "blocking") - Number(a.severity === "blocking"));
  for (const issue of quality.slice(0, 5)) {
    if (issues.some((item) => item.objectIds.some((id) => issue.ids.includes(id)) && item.dimension === issue.code)) continue;
    lines.push("[HEURISTIC " + issue.code + "] IDs=" + (issue.ids.join(",") || "none") + "; " + clip(issue.message, 150));
  }
  for (const item of (review?.rubric ?? []).filter((entry) => entry.status === "unresolved").slice(0, 3)) lines.push("[UNRESOLVED " + item.dimension + "] " + clip(item.note, 120));
  if (review?.summary) lines.push("Review summary: " + clip(review.summary, 140));
  const header = lines[0];
  const retained = [header];
  for (const line of lines.slice(1)) {
    const candidate = [...retained, line].join("\n");
    if (candidate.length > maxLength) break;
    retained.push(line);
  }
  return retained.join("\n");
}

/** Progress is accepted only when its project/site and observed saved geometry still match. */
export function verifyCadProgressSnapshot(
  value: unknown,
  current: { projectId: string; siteWidth: number; siteDepth: number; inspection: { counts: Record<string, number>; objects: number; segments: number } | null },
): CadProgressSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !current.inspection) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.projectId !== current.projectId || candidate.siteWidth !== current.siteWidth || candidate.siteDepth !== current.siteDepth) return null;
  if (typeof candidate.brief !== "string" || !candidate.brief.trim() || candidate.brief.length > 1500) return null;
  if (!Number.isInteger(candidate.completedSteps) || (candidate.completedSteps as number) < 1 || (candidate.completedSteps as number) > 6) return null;
  if (candidate.qualityFeedback !== undefined && (typeof candidate.qualityFeedback !== "string" || candidate.qualityFeedback.length > 1500)) return null;
  if (!Number.isInteger(candidate.objects) || !Number.isInteger(candidate.segments)) return null;
  if (candidate.objects !== current.inspection.objects || candidate.segments !== current.inspection.segments) return null;
  if (!candidate.counts || typeof candidate.counts !== "object" || Array.isArray(candidate.counts)) return null;
  const counts = candidate.counts as Record<string, unknown>;
  const expectedKeys = Object.keys(current.inspection.counts).sort();
  if (Object.keys(counts).sort().join("\0") !== expectedKeys.join("\0")) return null;
  if (expectedKeys.some((key) => !Number.isInteger(counts[key]) || counts[key] !== current.inspection!.counts[key])) return null;
  return { projectId: current.projectId, brief: candidate.brief, siteWidth: current.siteWidth, siteDepth: current.siteDepth, completedSteps: candidate.completedSteps as number, counts: current.inspection.counts, objects: current.inspection.objects, segments: current.inspection.segments, ...(typeof candidate.qualityFeedback === "string" ? { qualityFeedback: candidate.qualityFeedback } : {}) };
}

