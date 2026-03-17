import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Zap, CheckCircle, Users, Target, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const TIER_DATA = [
  {
    tier: "Critical",
    description: "If this didn't happen, someone would notice. Revenue impact, outage fixes, launch-blocking work.",
    example: "Fixing a payment webhook that was silently dropping subscriptions",
    color: "bg-destructive/10 text-destructive border-destructive/20",
  },
  {
    tier: "High",
    description: "Meaningful advancement. New features, significant improvements, deals closed.",
    example: "Shipping the onboarding redesign to staging with customer validation",
    color: "bg-primary/10 text-primary border-primary/20",
  },
  {
    tier: "Standard",
    description: "Solid execution. Bug fixes, tests, refactors, routine tasks. Keeps the machine running.",
    example: "Adding error handling to the booking API",
    color: "bg-muted text-muted-foreground border-border",
  },
  {
    tier: "Low",
    description: "Chores. Config changes, dependency bumps, formatting. Has to be done, doesn't move the needle.",
    example: "Updating ESLint rules",
    color: "bg-muted/50 text-muted-foreground border-border",
  },
];

const VALUE_TYPES = ["Ship", "Quality", "Foundation", "Growth", "Unblock"];

const COMPONENTS = [
  {
    icon: Zap,
    title: "Impact",
    weight: "40%",
    question: "What did your work actually do for the product?",
    description:
      "Every contribution — commits, PRs, tasks, standup commitments — is automatically classified by AI into one of four tiers. Each item also gets a value type and a focus alignment tag. The AI classifies the outcome, not the method — work shipped via Lovable, v0, or Cursor is scored the same as hand-written code. Your individual scores are summed, then log-compressed and normalized against the team median. The median maps to 50, with a floor of 5 for any active contributor — so you'll never see a 0 if you shipped real work. The log scale means a 10x difference in raw output shows up as a modest score gap, not a 10x score gap. This keeps scores meaningful even on small teams.",
    accent: "border-l-primary",
  },
  {
    icon: CheckCircle,
    title: "Delivery",
    weight: "30%",
    question: "Did you do what you said you'd do?",
    description:
      "Your commitment completion rate from standups. Three commitments, all shipped? 100%. Two out of three? 67%. This is the most important habit metric — reliable shipping compounds over time. No commitments logged? You get a neutral 50%, not penalized but not rewarded.",
    accent: "border-l-success",
  },
  {
    icon: Users,
    title: "Multiplier",
    weight: "15%",
    question: "Did you make others faster?",
    description:
      "Code reviews count here. Reviewing 10 PRs in a week gets you 100% on this component. A team where everyone multiplies each other vastly outperforms solo operators. In the future, reviews will be weighted by depth — a thorough 30-comment review will count more than a drive-by LGTM.",
    accent: "border-l-warning",
  },
  {
    icon: Target,
    title: "Focus",
    weight: "15%",
    question: "Was your work aligned with what we said matters right now?",
    description:
      'The percentage of your classified work that maps to active company focus areas. Work tagged as "direct" or "indirect" alignment counts. Maintenance and tech debt are legitimate — but if most of your week was off-focus, that\'s worth examining. If no focus areas are defined, this component is effectively skipped.',
    accent: "border-l-chart-emerald",
  },
];

const NOT_ITEMS = [
  {
    title: "It's not a ranking",
    description: "There is no leaderboard. Your score is a compass for you, showing where your time went and whether it matched your intentions.",
  },
  {
    title: "It's not purely automated",
    description: "The AI classification is a signal, not a verdict. It can misclassify — a critical fix might get tagged \"standard\" if the commit message doesn't explain the context. If you see something wrong, that's useful feedback.",
  },
  {
    title: "It's not code-only",
    description: "ClickUp tasks, standup commitments, and Slack help threads are all classified. Business work — customer onboarding, strategy docs, deal progression — counts just as much when classified at the right tier.",
  },
];

const TIPS = [
  {
    title: "Check your breakdown, not just the number",
    description: "A VIS of 60 with high Impact but low Focus tells a different story than 60 with low Impact but perfect Delivery. The components tell you what to adjust.",
  },
  {
    title: "Delivery is the score you control most",
    description: "Commit to realistic things in standup, then ship them. That's 30% of your score handled.",
  },
  {
    title: "The mid-week estimate is approximate",
    description: "The canonical score is computed Sunday night from the full week's data. During the week you see an estimate that updates every 5 minutes.",
  },
];

export default function VISExplained() {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">
      {/* Back button */}
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      {/* Hero */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">How your Value Impact Score works</h1>
        <p className="text-muted-foreground leading-relaxed">
          Your VIS measures <span className="font-medium text-foreground">what your work accomplishes</span> — not
          how many lines of code you wrote or how many hours you were online. A 12-line fix that saves a customer is
          worth more than a 3,000-line boilerplate migration. The score reflects that.
        </p>
      </div>

      {/* The four components */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">The four components</h2>
        <p className="text-sm text-muted-foreground">
          Every week, your VIS (0–100) is built from four things:
        </p>

        <div className="space-y-4">
          {COMPONENTS.map((comp) => (
            <Card key={comp.title} className={`border-l-4 ${comp.accent}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <comp.icon className="h-4 w-4 text-muted-foreground" />
                    {comp.title}
                  </span>
                  <Badge variant="secondary" className="text-xs font-mono">
                    {comp.weight}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm italic text-muted-foreground">"{comp.question}"</p>
                <p className="text-sm text-foreground leading-relaxed">{comp.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Impact tier table */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Impact tiers</h2>
        <p className="text-sm text-muted-foreground">
          Each contribution gets one of these. The value types are:{" "}
          {VALUE_TYPES.map((v, i) => (
            <span key={v}>
              <span className="font-medium text-foreground">{v}</span>
              {i < VALUE_TYPES.length - 1 ? ", " : "."}
            </span>
          ))}
        </p>
        <div className="space-y-2">
          {TIER_DATA.map((t) => (
            <Card key={t.tier} className="border">
              <CardContent className="p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-xs ${t.color}`}>
                    {t.tier}
                  </Badge>
                  <span className="text-sm text-foreground">{t.description}</span>
                </div>
                <p className="text-xs text-muted-foreground italic pl-1">Example: {t.example}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* What VIS is NOT */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">What VIS is NOT</h2>
        <div className="space-y-3">
          {NOT_ITEMS.map((item) => (
            <div key={item.title} className="flex gap-3">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How to use it */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">How to use it</h2>
        <div className="space-y-3">
          {TIPS.map((tip) => (
            <Card key={tip.title} className="border">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-foreground">{tip.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed mt-1">{tip.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
