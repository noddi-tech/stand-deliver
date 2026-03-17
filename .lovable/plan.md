

# Create a "How VIS Works" Explanation Page

## Approach
Create a new `/vis-explained` page accessible from within the app layout. The page will present the provided VIS documentation as a clean, scannable page using existing UI components (Card, Badge, etc.). A link to this page will be added to the VIS tooltip in MemberBreakdown so users can learn more.

## What to build

### 1. New page: `src/pages/VISExplained.tsx`
A static documentation page structured as:
- Hero section with the headline and one-liner explanation
- Four component cards (Impact 40%, Delivery 30%, Multiplier 15%, Focus 15%) with descriptions, examples, and the tier table for Impact
- "What VIS is NOT" section with three clear callouts
- "How to use it" section with actionable tips
- Uses existing Card, Badge, and layout primitives. No new dependencies.

### 2. Route registration in `App.tsx`
Add `/vis-explained` inside the protected AppLayout route group (line 63, alongside `/settings`).

### 3. Link from VIS tooltip in `MemberBreakdown.tsx`
Update the existing VIS tooltip (line 157-159) to include a "Learn more" link pointing to `/vis-explained`, so users can discover the page naturally when they hover on "VIS".

### Files modified
| File | Change |
|---|---|
| `src/pages/VISExplained.tsx` | New page with full VIS explanation content |
| `src/App.tsx` | Add route for `/vis-explained` |
| `src/components/team/MemberBreakdown.tsx` | Add "Learn more" link in VIS tooltip |

