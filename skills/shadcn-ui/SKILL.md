---
name: shadcn-ui
category: implementation
priority: medium
frameworks: [react]
libraries: [shadcn/ui]
triggers: [shadcn, radix, dialog, sheet, menu, tabs, command, accessible primitives, composable components, product ui]
description: shadcn/ui as accessible foundation — when to use, how to customize beyond default look.
---

# shadcn/ui

Use as foundation, not identity.

- **When**: accessible product primitives (Dialog, Sheet, Tabs, Dropdown, Command, Form) when you need a11y + composability.
- **How**: `npx shadcn@latest add button dialog sheet` — then override `className` via design tokens; don't keep default gray+purple if your language is ink+amber.
- **Don't**: make everything look like default shadcn docs; treat as unstylized primitives.
- **Pattern**: wrap with `cva` variants for your system (e.g., `buttonVariants({variant: 'ink'})`).
- **Performance**: tree-shake per component, not bulk install.
