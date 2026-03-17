/** CANONICAL VERSION — client copy at src/lib/activity-badges.ts */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Types ───

export interface ActivityBadge {
  emoji: string;
  label: string;
  key: string;
}

export interface BadgeResolution {
  badge: ActivityBadge;
  source: "manual" | "deterministic" | "ai" | "default";
  confidence: number; // 1.0 manual, 0.9 deterministic, 0.7 ai, 0.3 default
}

// ─── Badge Catalog (19 entries) ───

export const ALL_BADGES: Record<string, ActivityBadge> = {
  bugfix:       { emoji: "🐛", label: "Bug Fix", key: "bugfix" },
  feature:      { emoji: "🚀", label: "Feature", key: "feature" },
  refactor:     { emoji: "🔧", label: "Refactor", key: "refactor" },
  infra:        { emoji: "🏗️", label: "Infra", key: "infra" },
  docs:         { emoji: "📝", label: "Docs", key: "docs" },
  test:         { emoji: "🧪", label: "Test", key: "test" },
  security:     { emoji: "🔒", label: "Security", key: "security" },
  perf:         { emoji: "⚡", label: "Performance", key: "perf" },
  chore:        { emoji: "🧹", label: "Chore", key: "chore" },
  design:       { emoji: "🎨", label: "Design", key: "design" },
  growth:       { emoji: "📊", label: "Growth", key: "growth" },
  review:       { emoji: "🔀", label: "Review", key: "review" },
  review_deep:  { emoji: "🔀", label: "Deep Review", key: "review_deep" },
  review_light: { emoji: "🔀", label: "Approval", key: "review_light" },
  hotfix:       { emoji: "🔥", label: "Hotfix", key: "hotfix" },
  unblock:      { emoji: "🤝", label: "Unblock", key: "unblock" },
  task:         { emoji: "✅", label: "Task", key: "task" },
  commitment:   { emoji: "📋", label: "Commitment", key: "commitment" },
  style:        { emoji: "🎨", label: "Style", key: "style" },
};

// ─── Deterministic Matchers ───

const COMMIT_PREFIX_MAP: Record<string, ActivityBadge> = {
  fix:       ALL_BADGES.bugfix,
  feat:      ALL_BADGES.feature,
  refactor:  ALL_BADGES.refactor,
  chore:     ALL_BADGES.chore,
  docs:      ALL_BADGES.docs,
  test:      ALL_BADGES.test,
  ci:        ALL_BADGES.infra,
  build:     ALL_BADGES.infra,
  perf:      ALL_BADGES.perf,
  style:     ALL_BADGES.style,
  revert:    ALL_BADGES.hotfix,
  security:  ALL_BADGES.security,
  hotfix:    ALL_BADGES.hotfix,
};

export function badgeFromCommitMessage(message: string): ActivityBadge | null {
  const normalized = message.toLowerCase().trim();

  // Match "fix: ...", "fix(scope): ...", "fix!: ..."
  const match = normalized.match(/^(\w+)(?:\(.+?\))?!?:/);
  if (match && COMMIT_PREFIX_MAP[match[1]]) {
    return COMMIT_PREFIX_MAP[match[1]];
  }

  // Fallback keyword matching for non-conventional messages
  if (/\bhotfix\b|\burgent\b|\bcritical fix\b/i.test(normalized)) return COMMIT_PREFIX_MAP.hotfix;
  if (/\bfix(?:es|ed)?\b|\bbug\b|\bpatch\b/i.test(normalized)) return COMMIT_PREFIX_MAP.fix;
  if (/\badd(?:s|ed)?\b|\bnew\b|\bimplement/i.test(normalized)) return COMMIT_PREFIX_MAP.feat;
  if (/\brefactor\b|\bclean(?:up)?\b|\brestructur/i.test(normalized)) return COMMIT_PREFIX_MAP.refactor;
  if (/\btest\b|\bspec\b/i.test(normalized)) return COMMIT_PREFIX_MAP.test;
  if (/\bdoc(?:s|umentation)?\b|\breadme\b/i.test(normalized)) return COMMIT_PREFIX_MAP.docs;
  if (/\bdep(?:s|endenc)|\bbump\b|\bupgrade\b|\bci\b|\bpipeline\b/i.test(normalized)) return COMMIT_PREFIX_MAP.chore;

  return null;
}

const PR_LABEL_MAP: Record<string, ActivityBadge> = {
  bug:            ALL_BADGES.bugfix,
  bugfix:         ALL_BADGES.bugfix,
  feature:        ALL_BADGES.feature,
  enhancement:    ALL_BADGES.feature,
  refactor:       ALL_BADGES.refactor,
  documentation:  ALL_BADGES.docs,
  security:       ALL_BADGES.security,
  dependencies:   ALL_BADGES.chore,
  infrastructure: ALL_BADGES.infra,
};

export function badgeFromPR(labels: string[], title: string): ActivityBadge | null {
  for (const label of labels) {
    const normalized = label.toLowerCase().trim();
    if (PR_LABEL_MAP[normalized]) return PR_LABEL_MAP[normalized];
  }
  return badgeFromCommitMessage(title);
}

export function badgeFromReview(commentCount: number): ActivityBadge {
  if (commentCount >= 5) return ALL_BADGES.review_deep;
  if (commentCount >= 1) return ALL_BADGES.review;
  return ALL_BADGES.review_light;
}

const CLICKUP_LIST_MAP: Record<string, ActivityBadge> = {
  bugs:       ALL_BADGES.bugfix,
  features:   ALL_BADGES.feature,
  backlog:    ALL_BADGES.feature,
  infra:      ALL_BADGES.infra,
  platform:   ALL_BADGES.infra,
  design:     ALL_BADGES.design,
  growth:     ALL_BADGES.growth,
  sales:      ALL_BADGES.growth,
  onboarding: ALL_BADGES.growth,
};

export function badgeFromClickUpTask(listName: string, tags: string[]): ActivityBadge | null {
  for (const tag of tags) {
    const normalized = tag.toLowerCase().trim();
    if (CLICKUP_LIST_MAP[normalized]) return CLICKUP_LIST_MAP[normalized];
  }
  const normalizedList = listName.toLowerCase().trim();
  for (const [key, badge] of Object.entries(CLICKUP_LIST_MAP)) {
    if (normalizedList.includes(key)) return badge;
  }
  return null;
}

export function badgeFromCommitment(text: string): ActivityBadge | null {
  const normalized = text.toLowerCase();
  if (/\bfix\b|\bbug\b|\bpatch\b|\bresolve\b/i.test(normalized)) return ALL_BADGES.bugfix;
  if (/\bship\b|\blaunch\b|\bdeploy\b|\brelease\b/i.test(normalized)) return ALL_BADGES.feature;
  if (/\breview\b|\bpr\b|\bfeedback\b/i.test(normalized)) return ALL_BADGES.review;
  if (/\bdesign\b|\bfigma\b|\bmockup\b|\bui\b/i.test(normalized)) return ALL_BADGES.design;
  if (/\bcall\b|\bmeeting\b|\bdemo\b|\bcustomer\b|\bonboard/i.test(normalized)) return ALL_BADGES.growth;
  if (/\bdoc\b|\bwrite\b|\bspec\b/i.test(normalized)) return ALL_BADGES.docs;
  if (/\brefactor\b|\bclean/i.test(normalized)) return ALL_BADGES.refactor;
  return null;
}

// ─── AI Classification Mapper ───

const VALUE_TYPE_BADGE_MAP: Record<string, ActivityBadge> = {
  ship:       ALL_BADGES.feature,
  quality:    ALL_BADGES.bugfix,
  foundation: ALL_BADGES.infra,
  growth:     ALL_BADGES.growth,
  unblock:    ALL_BADGES.unblock,
};

export function badgeFromAIClassification(classification: {
  value_type: string;
  impact_tier: string;
}): ActivityBadge {
  if (classification.value_type === "quality" && classification.impact_tier === "critical") {
    return ALL_BADGES.hotfix;
  }
  return VALUE_TYPE_BADGE_MAP[classification.value_type] || ALL_BADGES.chore;
}

// ─── Source Defaults ───

const SOURCE_DEFAULTS: Record<string, ActivityBadge> = {
  commit:           ALL_BADGES.chore,
  pr_opened:        ALL_BADGES.feature,
  pr_merged:        ALL_BADGES.feature,
  pr_review:        ALL_BADGES.review,
  task_completed:   ALL_BADGES.task,
  task_started:     ALL_BADGES.task,
  task_updated:     ALL_BADGES.task,
  commitment:       ALL_BADGES.commitment,
};

// ─── Resolver ───

export function resolveActivityBadge(activity: {
  source: string;
  activity_type: string;
  title: string;
  metadata?: Record<string, any>;
  manual_badge_key?: string | null;
  classification?: { value_type: string; impact_tier: string } | null;
}): BadgeResolution {
  // Priority 1: Manual override
  if (activity.manual_badge_key) {
    const badge = ALL_BADGES[activity.manual_badge_key];
    if (badge) return { badge, source: "manual", confidence: 1.0 };
  }

  // Priority 2: Deterministic rules
  let deterministicBadge: ActivityBadge | null = null;

  if (activity.source === "github") {
    if (activity.activity_type === "pr_review") {
      const commentCount = activity.metadata?.review_comments || 0;
      deterministicBadge = badgeFromReview(commentCount);
    } else if (activity.activity_type === "pr_opened" || activity.activity_type === "pr_merged") {
      const labels = activity.metadata?.labels || [];
      deterministicBadge = badgeFromPR(labels, activity.title);
    } else if (activity.activity_type === "commit") {
      deterministicBadge = badgeFromCommitMessage(activity.title);
    }
  } else if (activity.source === "clickup") {
    const listName = activity.metadata?.list_name || activity.metadata?.list || "";
    const tags = activity.metadata?.tags || [];
    deterministicBadge = badgeFromClickUpTask(listName, tags);
  } else if (activity.source === "standup") {
    deterministicBadge = badgeFromCommitment(activity.title);
  }

  if (deterministicBadge) {
    return { badge: deterministicBadge, source: "deterministic", confidence: 0.9 };
  }

  // Priority 3: AI classification
  if (activity.classification) {
    return {
      badge: badgeFromAIClassification(activity.classification),
      source: "ai",
      confidence: 0.7,
    };
  }

  // Priority 4: Source-based default
  return {
    badge: SOURCE_DEFAULTS[activity.activity_type] || { emoji: "📋", label: "Activity", key: "activity" },
    source: "default",
    confidence: 0.3,
  };
}

// ─── Upsert Helper (called by edge functions) ───

export async function upsertBadge(
  sb: ReturnType<typeof createClient>,
  activity: {
    id: string;
    source: string;
    activity_type: string;
    title: string;
    source_type: string; // 'external_activity' | 'commitment'
    metadata?: Record<string, any>;
  },
  teamId: string
): Promise<void> {
  const resolution = resolveActivityBadge(activity);
  try {
    await sb.rpc("upsert_activity_badge", {
      p_activity_id: activity.id,
      p_source_type: activity.source_type,
      p_team_id: teamId,
      p_badge_key: resolution.badge.key,
      p_badge_source: resolution.source,
      p_confidence: resolution.confidence,
    });
  } catch (e) {
    console.error(`upsertBadge error for ${activity.id}:`, e);
  }
}
