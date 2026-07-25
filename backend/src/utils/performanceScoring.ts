/**
 * DGMAX Performance Scoring Engine — the single source of truth.
 *
 * Every employee starts the week at 100. Only delays and incomplete work pull
 * the score down; there are no bonus points, so the score can only decrease.
 *
 *   PerTaskPercentage = 100 / TotalAssignedTasks
 *   NotDonePenalty    = NotDone  x PerTaskPercentage
 *   LateDonePenalty   = LateDone x PerTaskPercentage x (lateDoneWeight / 100)
 *   NegativeScore     = -(NotDonePenalty + LateDonePenalty)
 *   PerformanceScore  = clamp(100 + NegativeScore, 0, 100)
 *
 * Every dashboard, leaderboard, report and analytic must call this — never
 * reimplement the arithmetic elsewhere.
 */

/** Penalty weight applied to Late Done tasks, as a percentage. Admin-configurable. */
export const DEFAULT_LATE_DONE_WEIGHT = 60;

export type PerformanceStatusColor = "Green" | "Yellow" | "Orange" | "Red";

export interface PerformanceInput {
  assigned: number;
  onTime: number;
  lateDone: number;
  notDone: number;
}

export interface PerformanceResult {
  perTaskPercentage: number;
  notDonePenalty: number;
  lateDonePenalty: number;
  negativeScore: number;
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
  lateDoneWeight: number = DEFAULT_LATE_DONE_WEIGHT
): PerformanceResult {
  const assigned = Math.max(0, Number(input.assigned) || 0);
  const lateDone = Math.max(0, Number(input.lateDone) || 0);
  const notDone = Math.max(0, Number(input.notDone) || 0);
  const weight = Math.min(100, Math.max(0, Number(lateDoneWeight) || 0)) / 100;

  // No assigned work means nothing could be late or missed — a clean 100.
  if (assigned === 0) {
    return {
      perTaskPercentage: 0,
      notDonePenalty: 0,
      lateDonePenalty: 0,
      negativeScore: 0,
      performanceScore: 100,
      statusColor: statusColorFor(100),
    };
  }

  const perTaskPercentage = 100 / assigned;
  const notDonePenalty = notDone * perTaskPercentage;
  const lateDonePenalty = lateDone * perTaskPercentage * weight;
  const negativeScore = -(notDonePenalty + lateDonePenalty);
  const performanceScore = Math.min(100, Math.max(0, 100 + negativeScore));

  return {
    perTaskPercentage: round2(perTaskPercentage),
    notDonePenalty: round2(notDonePenalty),
    lateDonePenalty: round2(lateDonePenalty),
    negativeScore: round2(negativeScore),
    performanceScore: round2(performanceScore),
    statusColor: statusColorFor(performanceScore),
  };
}
