---
name: tailwind
category: implementation
priority: medium
frameworks: [react, vite, next]
libraries: [tailwind]
triggers: [tailwind, tailwindcss, tailwind css, utility-first, tailwind classes, className=]
description: Tailwind CSS utility-first styling — class conventions, config, component extraction, dark mode.
---

# Tailwind CSS

When the workspace uses Tailwind (tailwind.config.js exists or package.json has "tailwindcss"):

## Utility-First Basics
Use utility classes directly in JSX/HTML:
```html
<button class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition transform hover:-translate-y-0.5">
  Click me
</button>
```

## Responsive Prefixes (mobile-first)
```html
<div class="text-sm md:text-base lg:text-lg">
  <p class="text-center sm:text-left">Content</p>
</div>
```

## Color System
```html
bg-slate-900 text-slate-100 accent-sky-500
border border-slate-200 dark:border-slate-700
hover:bg-sky-500 focus:ring-2 focus:ring-sky-400
```

## Layout Utilities
```html
container mx-auto px-4
grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
flex items-center justify-between
```

## Dark Mode
```html
class="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
```
Configure in `tailwind.config.js`:
```js
module.exports = {
  darkMode: 'class', // or 'media'
  content: ['./src/**/*.{jsx,tsx,js,ts,html}'],
  theme: { extend: { colors: { accent: '#3b6df6' } } },
  plugins: [],
}
```

## Custom Components (extract common patterns)
```js
// tailwind.config.js
theme: {
  extend: {
    fontFamily: { sans: ['Inter', 'system-ui'], display: ['Fraunces', 'serif'] },
    animation: { 'spin-slow': 'spin 3s linear infinite' },
  }
}
```

Or use `@layer components` in CSS:
```css
@layer components {
  .btn-primary { @apply px-4 py-2 bg-blue-500 text-white rounded font-medium hover:bg-blue-600 transition; }
}
```

## When NOT to Use Tailwind
- Complex animations (use CSS keyframes or JS)
- Highly custom visual effects (plain CSS is fine)
- When the project doesn't use Tailwind