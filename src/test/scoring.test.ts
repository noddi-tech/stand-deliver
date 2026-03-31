import { describe, it, expect } from "vitest";
import { computeImpactScore, computeVISTotal, computeNormalizedImpact } from "@/lib/scoring";
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

describe("computeVISTotal - absolute baseline normalization", () => {
  it("rawImpact=100, baseline=100 produces ~60 normalized impact", () => {
    const normalized = computeNormalizedImpact(100, 100);
    // log10(101) / log10(101) * 60 = 60
    expect(normalized).toBeCloseTo(60, 0);
  });

  it("rawImpact=50, baseline=100 produces ~45 normalized impact", () => {
    const normalized = computeNormalizedImpact(50, 100);
    // log10(51) / log10(101) * 60 ≈ 51.2
    expect(normalized).toBeGreaterThan(40);
    expect(normalized).toBeLessThan(55);
  });

  it("rawImpact=200, baseline=100 produces ~72 normalized impact", () => {
    const normalized = computeNormalizedImpact(200, 100);
    expect(normalized).toBeGreaterThan(65);
    expect(normalized).toBeLessThan(80);
  });

  it("rawImpact=500, baseline=100 produces ~86 normalized impact", () => {
    const normalized = computeNormalizedImpact(500, 100);
    expect(normalized).toBeGreaterThan(75);
    expect(normalized).toBeLessThan(95);
  });

  it("rawImpact=0 produces 0 normalized impact", () => {
    expect(computeNormalizedImpact(0, 100)).toBe(0);
  });

  it("rawImpact=10, baseline=100 produces ~27 normalized impact", () => {
    const normalized = computeNormalizedImpact(10, 100);
    expect(normalized).toBeGreaterThan(20);
    expect(normalized).toBeLessThan(35);
  });

  it("computes full VIS total correctly with rawImpact", () => {
    // rawImpact=100, baseline=100 → normalizedImpact≈60
    // 60*0.4 + 80*0.3 + 40*0.15 + 70*0.15 = 24 + 24 + 6 + 10.5 = 64.5
    const result = computeVISTotal({
      rawImpact: 100,
      deliveryScore: 80,
      multiplierScore: 40,
      focusRatio: 70,
    }, 100);
    expect(result).toBeCloseTo(64.5, 0);
  });

  it("clamps to 0-100", () => {
    // Extremely high rawImpact
    const high = computeVISTotal({
      rawImpact: 1000000,
      deliveryScore: 100,
      multiplierScore: 100,
      focusRatio: 100,
    }, 100);
    expect(high).toBeLessThanOrEqual(100);

    // Zero everything
    const zero = computeVISTotal({
      rawImpact: 0,
      deliveryScore: 0,
      multiplierScore: 0,
      focusRatio: 0,
    }, 100);
    expect(zero).toBe(0);
  });

  it("different baselines produce different scores for same rawImpact", () => {
    const low = computeVISTotal({ rawImpact: 100, deliveryScore: 50, multiplierScore: 50, focusRatio: 50 }, 50);
    const high = computeVISTotal({ rawImpact: 100, deliveryScore: 50, multiplierScore: 50, focusRatio: 50 }, 500);
    expect(low).toBeGreaterThan(high);
  });
});

describe("computeImpactScore - behavioral", () => {
  it("critical 12-line fix scores higher than low 10000-line chore", () => {
    const criticalFix = computeImpactScore({
      impact_tier: "critical",
      value_type: "quality",
      focus_alignment: "direct",
      size: 12,
    });
    const largeChore = computeImpactScore({
      impact_tier: "low",
      value_type: "foundation",
      focus_alignment: "none",
      size: 10000,
    });
    expect(criticalFix).toBeGreaterThan(largeChore * 5);
  });

  it("non-code item (size=0) uses sizeFactor 1.0", () => {
    const score = computeImpactScore({
      impact_tier: "high",
      value_type: "growth",
      focus_alignment: "none",
      size: 0,
    });
    // 25 * 1.5 * 1.0 * 1.0 = 37.5
    expect(score).toBe(37.5);
  });

  it("falls back to defaults for unknown enum values", () => {
    const score = computeImpactScore({
      impact_tier: "unknown" as any,
      value_type: "unknown" as any,
      focus_alignment: "unknown" as any,
      size: 100,
    });
    expect(score).toBeGreaterThan(9);
    expect(score).toBeLessThan(11);
  });
});
