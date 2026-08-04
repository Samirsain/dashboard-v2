/**
 * DGMAX Performance Scoring Engine — the single source of truth.
 *
 * Every employee starts the week clean at 0. Only delays, incomplete work,
 * and revisions pull the score down; there are no bonus points, so the score
 * can only go negative. `negativeScore` IS the final score an employee is
 * judged on — 0 is perfect, -100 is the worst possible week.
 *
 *   PerTaskPercentage = 100 / TotalAssignedTasks
 *   NotDonePenalty    = NotDone   x PerTaskPercentage
 *   LateDonePenalty   = LateDone  x PerTaskPercentage x (lateDoneWeight / 100)
 *   RevisionPenalty   = Revisions x PerTaskPercentage x (revisionPenaltyPct / 100)
 *   NegativeScore     = clamp(-(NotDonePenalty + LateDonePenalty + RevisionPenalty), -100, 0)  <- final score
 *   PerformanceScore  = 100 + NegativeScore   (the same score on a 0-100 scale,
 *                       for anything that wants a positive figure)
 *
 * RevisionPenalty is a flat per-revision cut, independent of whether the task
 * eventually finished on time — every time a due date gets pushed, that's
 * counted, not just the outcome. It stacks: 3 revisions on one task is 3x the
 * penalty.
 *
 * Every dashboard, leaderboard, report and analytic must call this — never
 * reimplement the arithmetic elsewhere.
 */

/** Penalty weight applied to Late Done tasks, as a percentage. Admin-configurable. */
export const DEFAULT_LATE_DONE_WEIGHT = 60;

/** Penalty applied per task revision, as a percentage of that task's share. */
export const DEFAULT_REVISION_PENALTY_PCT = 20;

export type PerformanceStatusColor = "Green" | "Yellow" | "Orange" | "Red";

export interface PerformanceInput {
  assigned: number;
  onTime: number;
  lateDone: number;
  notDone: number;
  /** Total revision count across the assigned tasks this period. */
  revisions?: number;
}

export interface PerformanceResult {
  perTaskPercentage: number;
  notDonePenalty: number;
  lateDonePenalty: number;
  revisionPenalty: number;
  /** The final score: 0 (perfect) down to -100 (worst). */
  negativeScore: number;
  /** The same score expressed on a 0-100 scale (100 + negativeScore). */
  performanceScore: number;
  statusColor: PerformanceStatusColor;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 90-100 Green, 70-89 Yellow, 50-69 Orange, below 50 Red. */
export function statusColorFor(score: number): PerformanceStatusColor {
  if (score >= 90) return "Green";
  if (score >= 70) return "Yellow";
  if (score >= 50) return "Orange";
  return "Red";
}

export function calculatePerformance(
  input: PerformanceInput,
  lateDoneWeight: number = DEFAULT_LATE_DONE_WEIGHT,
  revisionPenaltyPct: number = DEFAULT_REVISION_PENALTY_PCT
): PerformanceResult {
  const assigned = Math.max(0, Number(input.assigned) || 0);
  const lateDone = Math.max(0, Number(input.lateDone) || 0);
  const notDone = Math.max(0, Number(input.notDone) || 0);
  const revisions = Math.max(0, Number(input.revisions) || 0);
  const weight = Math.min(100, Math.max(0, Number(lateDoneWeight) || 0)) / 100;
  const revisionWeight = Math.max(0, Number(revisionPenaltyPct) || 0) / 100;

  // No assigned work means nothing could be late, missed, or revised — a clean 100.
  if (assigned === 0) {
    return {
      perTaskPercentage: 0,
      notDonePenalty: 0,
      lateDonePenalty: 0,
      revisionPenalty: 0,
      negativeScore: 0,
      performanceScore: 100,
      statusColor: statusColorFor(100),
    };
  }

  const perTaskPercentage = 100 / assigned;
  const notDonePenalty = notDone * perTaskPercentage;
  const lateDonePenalty = lateDone * perTaskPercentage * weight;
  const revisionPenalty = revisions * perTaskPercentage * revisionWeight;
  const negativeScore = Math.min(
    0,
    Math.max(-100, -(notDonePenalty + lateDonePenalty + revisionPenalty))
  );
  const performanceScore = Math.min(100, Math.max(0, 100 + negativeScore));

  return {
    perTaskPercentage: round2(perTaskPercentage),
    notDonePenalty: round2(notDonePenalty),
    lateDonePenalty: round2(lateDonePenalty),
    revisionPenalty: round2(revisionPenalty),
    negativeScore: round2(negativeScore),
    performanceScore: round2(performanceScore),
    statusColor: statusColorFor(performanceScore),
  };
}
