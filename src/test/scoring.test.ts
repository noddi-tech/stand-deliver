import { describe, it, expect } from "vitest";
import { computeImpactScore, computeVISTotal } from "@/lib/scoring";
import type { ClassificationInput } from "@/lib/scoring";

/**
 * Drift-detection test: fixed inputs with expected outputs.
 * If the canonical formula in supabase/functions/_shared/scoring.ts changes,
 * update src/lib/scoring.ts to match, then update expected values here.
 */

const FIXED_CASES: { input: ClassificationInput; expected: number }[] = [
  // Critical ship, direct alignment, large PR (1000 LOC)
  { input: { impact_tier: "critical", value_type: "ship", focus_alignment: "direct", size: 1000 }, expected: 157.52 },
  // High quality, indirect, medium PR (200 LOC)
  { input: { impact_tier: "high", value_type: "quality", focus_alignment: "indirect", size: 200 }, expected: 39.73 },
  // Standard foundation, no alignment, no code (standup commitment)
  { input: { impact_tier: "standard", value_type: "foundation", focus_alignment: "none", size: 0 }, expected: 10 },
  // Low unblock, direct, small change (10 LOC)
  { input: { impact_tier: "low", value_type: "unblock", focus_alignment: "direct", size: 10 }, expected: 2.85 },
  // Critical growth, none, zero size
  { input: { impact_tier: "critical", value_type: "growth", focus_alignment: "none", size: 0 }, expected: 75 },
  // Standard ship, direct, 1 LOC
  { input: { impact_tier: "standard", value_type: "ship", focus_alignment: "direct", size: 1 }, expected: 10.5 },
];

describe("computeImpactScore - drift detection", () => {
  FIXED_CASES.forEach(({ input, expected }, i) => {
    it(`case ${i}: ${input.impact_tier}/${input.value_type}/${input.focus_alignment}/size=${input.size}`, () => {
      const result = computeImpactScore(input);
      expect(result).toBeCloseTo(expected, 1);
    });
  });
});

describe("computeVISTotal", () => {
  it("computes weighted composite correctly", () => {
    const result = computeVISTotal({
      normalizedImpact: 60,
      deliveryScore: 80,
      multiplierScore: 40,
      focusRatio: 70,
    });
    // 60*0.4 + 80*0.3 + 40*0.15 + 70*0.15 = 24 + 24 + 6 + 10.5 = 64.5
    expect(result).toBe(64.5);
  });

  it("clamps to 0-100", () => {
    expect(computeVISTotal({ normalizedImpact: 200, deliveryScore: 200, multiplierScore: 200, focusRatio: 200 })).toBe(100);
    expect(computeVISTotal({ normalizedImpact: -50, deliveryScore: -50, multiplierScore: -50, focusRatio: -50 })).toBe(0);
  });
});
