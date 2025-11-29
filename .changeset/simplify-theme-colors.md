---
"@boldvideo/bold-js": minor
---

Simplify ThemeColors type to match new 9-token backend theme system (BOLD-919)

**ThemeColors changes:**
- Added: `accent`, `accent-foreground`, `surface`
- Removed: `card`, `card-foreground`, `destructive`, `destructive-foreground`, `input`, `popover`, `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`

**ThemeConfig changes:**
- Added: `color_scheme` field (`"toggle" | "light" | "dark"`)

This aligns the SDK types with the backend's dynamically derived OKLCH theme tokens (BOLD-921).
