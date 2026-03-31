/**
 * Client copy of VIS impact scoring formula.
 * CANONICAL VERSION: supabase/functions/_shared/scoring.ts
 * Do NOT modify this file independently — update the canonical version first,
 * then copy here. The drift-detection test (src/test/scoring.test.ts) will catch mismatches.
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
 * Compute VIS composite score using absolute-baseline normalization.
 *
 * normalizedImpact = clamp(log10(rawImpact + 1) / log10(referenceBaseline + 1) * 60, 0, 100)
 * Weights: impact 40%, delivery 30%, multiplier 15%, focus 15%
 */
export function computeVISTotal(
  components: {
    rawImpact: number;
    deliveryScore: number;
    multiplierScore: number;
    focusRatio: number;
  },
  referenceBaseline: number = 100
): number {
  const logRef = Math.log10(referenceBaseline + 1);
  const normalizedImpact = logRef > 0
    ? Math.min(100, Math.max(0, (Math.log10(components.rawImpact + 1) / logRef) * 60))
    : 0;

  const total =
    normalizedImpact * 0.40 +
    components.deliveryScore * 0.30 +
    components.multiplierScore * 0.15 +
    components.focusRatio * 0.15;
  return Math.round(Math.max(0, Math.min(100, total)) * 100) / 100;
}

/**
 * Helper to compute normalizedImpact from rawImpact + baseline.
 */
export function computeNormalizedImpact(rawImpact: number, referenceBaseline: number = 100): number {
  const logRef = Math.log10(referenceBaseline + 1);
  if (logRef <= 0) return 0;
  return Math.min(100, Math.max(0, (Math.log10(rawImpact + 1) / logRef) * 60));
}
