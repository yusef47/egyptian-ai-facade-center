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

