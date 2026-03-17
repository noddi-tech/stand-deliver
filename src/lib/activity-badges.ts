/** CANONICAL: supabase/functions/_shared/activity-badges.ts — keep in sync */

export interface ActivityBadge {
  emoji: string;
  label: string;
  key: string;
}

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
