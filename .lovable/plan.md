

# Widen the AI Review Modal

## Change
**File:** `src/pages/MyStandup.tsx`, line 1196

Change the `DialogContent` class from `max-w-lg` (32rem / 512px) to `max-w-2xl` (42rem / 672px). This gives the suggestions, badges, and rewrite text more breathing room without becoming oversized.

```tsx
// Before
<DialogContent className="max-w-lg">

// After
<DialogContent className="max-w-2xl">
```

One class change, one line.

