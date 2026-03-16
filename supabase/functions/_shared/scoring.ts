/**
 * CANONICAL VERSION — Single source of truth for VIS impact scoring.
 * Client copy: src/lib/scoring.ts
 * If you change this file, update the client copy AND the drift-detection test.
 */

export interface ClassificationInput {
  impact_tier: "critical" | "high" | "standard" | "low";
  value_type: "ship" | "quality" | "foundation" | "growth" | "unblock";
  focus_alignment: "direct" | "indirect" | "none";
  /** Total lines changed (additions + deletions). Use 0 for non-code items. */
  size: number;
}

const TIER_BASE: Record<string, number> = {
  critical: 50,
  high: 25,
  standard: 10,
  low: 3,
};

const TYPE_MULTIPLIER: Record<string, number> = {
  ship: 1.5,
  quality: 1.2,
  foundation: 1.0,
  growth: 1.5,
  unblock: 1.3,
};

const FOCUS_BONUS: Record<string, number> = {
  direct: 1.4,
  indirect: 1.15,
  none: 1.0,
};

/**
 * Compute deterministic impact score for a single classified item.
 * Formula: tierBase * typeMultiplier * focusBonus * sizeFactor
 * sizeFactor = clamp(log10(size + 1) / 2, 0.5, 2.0) — defaults to 1.0 for non-code (size=0)
 */
export function computeImpactScore(input: ClassificationInput): number {
  const tierBase = TIER_BASE[input.impact_tier] ?? 10;
  const typeMultiplier = TYPE_MULTIPLIER[input.value_type] ?? 1.0;
  const focusBonus = FOCUS_BONUS[input.focus_alignment] ?? 1.0;

  let sizeFactor = 1.0;
  if (input.size > 0) {
    sizeFactor = Math.log10(input.size + 1) / 2;
    sizeFactor = Math.max(0.5, Math.min(2.0, sizeFactor));
  }

  return Math.round(tierBase * typeMultiplier * focusBonus * sizeFactor * 100) / 100;
}

/**
 * Compute VIS composite score from four components.
 * Weights: impact 40%, delivery 30%, multiplier 15%, focus 15%
 */
export function computeVISTotal(components: {
  normalizedImpact: number;
  deliveryScore: number;
  multiplierScore: number;
  focusRatio: number;
}): number {
  const total =
    components.normalizedImpact * 0.4 +
    components.deliveryScore * 0.3 +
    components.multiplierScore * 0.15 +
    components.focusRatio * 0.15;
  return Math.round(Math.max(0, Math.min(100, total)) * 100) / 100;
}
