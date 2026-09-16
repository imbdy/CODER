---
name: nextjs
category: implementation
priority: high
frameworks: [next]
libraries: [next]
triggers: [next, nextjs, next.js, app router, pages router, nextjs app, create next, vercel, route handler, server component, client component, layout.tsx, page.tsx]
description: Next.js App Router patterns — file structure, server/client components, routing, data fetching, styling.
---

# Next.js (App Router)

When the workspace is a Next.js project (package.json has "next" or has `app/` or `pages/` dir):

## File Structure (App Router — modern)
```
app/
  layout.tsx          ← root layout, wraps all pages
  page.tsx            ← `/` route
  about/
    page.tsx          ← `/about` route
  dashboard/
    layout.tsx        ← nested layout for /dashboard/*
    page.tsx
  components/
  styles/
    globals.css
    globals.scss
```

## Route Rules
- `app/page.tsx` → `/`
- `app/about/page.tsx` → `/about`
- `app/blog/[slug]/page.tsx` → `/blog/:slug`
- `app/dashboard/layout.tsx` → shared layout for `/dashboard/*`
- `app/api/health/route.ts` → API route at `/api/health`
- `app/loading.tsx` → loading UI (shown during suspense)
- `app/not-found.tsx` → 404 page

## Server vs Client Components
- **Server Components** (default): `async` components, run on server, can fetch data directly
- **Client Components**: add `'use client'` at the very top of the file

```tsx
// Server Component (default) — can be async
export default async function Page() {
  const data = await fetchData()  // direct data fetch, no useState for loading
  return <div>{data.content}</div>
}

// Client Component — for interactivity
'use client'
import { useState } from 'react'

export default function Interactive() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}
```

## Data Fetching
```tsx
// Server: async/await in component
const res = await fetch('https://api.example.com/data')
const data = await res.json()

// Client: useEffect / SWR / React Query
useEffect(() => {
  fetchData().then(setData)
}, [])
```

## Styling
- Global CSS: `app/globals.css` imported in `layout.tsx`
- CSS Modules: `import styles from './Card.module.css'`
- Tailwind: configured in `tailwind.config.js` / `tailwind.config.ts`
- Link: `next/link` → `<Link href="/about">About</Link>`
- Image: `next/image` → `<Image src="/img.png" alt="alt" width={500} height={300} />`
- Script: `next/script`

## Export (Next.js 13+)
```tsx
// app/page.tsx
export const metadata = {
  title: 'My App',
  description: 'Built with Next.js',
}

export default function Home() {
  return <main>Hello</main>
}
```

## Common Patterns
- Root layout provides `<html>`, `<body>`, fonts, providers
- Use `cn()` or `clsx` for conditional className merging
- API routes go in `app/api/*/route.ts` and export `GET`, `POST`, etc.
- Use `generateMetadata` for dynamic meta tags