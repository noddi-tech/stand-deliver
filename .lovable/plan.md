

# StandFlow — Async Standup & Accountability App

## Overview
A team standup app where commitments follow people until explicitly resolved. Supports async web standups and timed physical meeting mode. Built with React, TypeScript, Tailwind, Shadcn/UI, and Supabase.

## Phase 1: Foundation
- **Database**: Create all 10 tables (organizations, profiles, organization_members, teams, team_members, standup_sessions, standup_responses, commitments, blockers) with RLS policies and auto-profile trigger
- **Design System**: Dark-mode-first theme (slate-950 bg, blue-500 accent, emerald/amber/red status colors), Inter font, Linear/Notion polish
- **Auth**: Magic link login with Supabase Auth, session management, protected routes

## Phase 2: Onboarding Flow
- Post-login guided setup: create org → create team → set standup schedule (day picker + time + timezone) → invite members via email
- Centered card layout with step progress indicator

## Phase 3: App Shell & Navigation
- Collapsible sidebar with: Dashboard, My Standup, Team Feed, Meeting Mode, Analytics (placeholder), Settings
- Org name + user avatar at top, team selector dropdown
- Command palette (Cmd+K) for quick navigation
- Keyboard shortcuts throughout the app

## Phase 4: Dashboard (`/dashboard`)
- 4 metric cards: Team Health Score (circular ring), Completion Rate (sparkline), Active Blockers, Carry-Over Rate
- "Needs Attention" section for items carried 2+ times and old blockers
- Team members grid with submission status, mood, open commitments
- "Start Today's Standup" button
- React Query with loading skeletons

## Phase 5: My Standup (`/standup`) — Core Page
- **Section 1 — Resolve Previous Commitments**: Cards for all open items with Done/In Progress/Blocked/Drop actions, progress bar, animated transitions
- **Section 2 — Today's Focus**: Locked until Section 1 resolved; add new commitments with priority
- **Section 3 — Blockers & Notes**: Optional textarea inputs
- **Section 4 — Mood Check**: 5 emoji buttons with selected state
- Submit creates standup_response + new commitments, then shows summary view

## Phase 6: Team Feed (`/team`)
- Chronological feed of standup responses grouped by date
- Each card: avatar, name, mood, resolved items, new focus items, blockers
- Filters: member, date range (Today/This Week/Custom), status

## Phase 7: Meeting Mode (`/meeting`) — Full Screen
- Entry screen → speaker order randomization → individual turn view
- Large countdown timer (SVG circle, color transitions emerald→amber→red→pulsing)
- Speaker info with carried items, new commitments, blockers
- Controls: Next/Pause/+30s/Skip with keyboard shortcuts
- Blockers board after all speakers
- Summary view with stats and confetti on completion
- Full viewport, large text for TV/projector readability

## Phase 8: Settings (`/settings`)
- Tabs: Team, Schedule, Members, Integrations
- Schedule: visual day toggles, time picker, timezone
- Members: list, invite by email, role management
- Integrations: Slack "Coming Soon" placeholder
- Timer settings: seconds-per-person slider

## Phase 9: Polish & UX
- Optimistic updates for status changes
- Toast notifications via Sonner
- Empty states on every page
- Error boundaries with retry
- Responsive design (desktop-first, mobile-functional)
- Smooth 150ms transitions on all interactive elements
- Accessibility: ARIA labels, focus rings, keyboard nav

