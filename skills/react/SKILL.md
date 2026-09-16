---
name: react
category: implementation
priority: high
frameworks: [react, vite, next]
libraries: [react]
triggers: [react, jsx, tsx, component, component-based, react component, react app, react project, create react, react+vite, vite+react]
description: React component patterns — JSX, props, hooks, composition, state management, file structure.
---

# React Engineering

When the workspace uses React (package.json has "react" or files are .jsx/.tsx):

## Project Structure (Vite + React)
```
src/
  App.jsx          ← root component
  main.jsx         ← entry (createRoot)
  components/      ← reusable pieces
  styles/          ← CSS files
```

## Project Structure (Next.js App Router)
```
app/
  layout.tsx       ← root layout (html, body, providers)
  page.tsx         ← route page
  components/      ← shared components
  styles/          ← global + module CSS
```

## JSX Rules
- Use `className` not `class`
- Conditional: `{condition && <Element />}` or `{condition ? <A/> : <B/>}`
- Lists: `{items.map((item) => <li key={item.id}>{item.name}</li>)}`
- Event handlers: `onClick`, `onSubmit`, `onKeyDown` — camelCase
- Self-closing: `<img src="..." alt="..." />`
- Fragments: `<>...</>` or `<React.Fragment>...</React.Fragment>`

## Component Pattern
```jsx
import { useState, useEffect } from 'react'

export default function Button({ label, onClick, variant = 'primary' }) {
  const [isLoading, setIsLoading] = useState(false)
  
  const handleClick = async (e) => {
    setIsLoading(true)
    await onClick?.(e)
    setIsLoading(false)
  }
  
  return (
    <button 
      className={`btn btn--${variant}`}
      onClick={handleClick}
      disabled={isLoading}
      aria-busy={isLoading}
    >
      <span className="btn__label">{label}</span>
      {isLoading && <span className="btn__spinner" aria-label="loading" />}
    </button>
  )
}
```

## Composition — Props as Children
Prefer composition over configuration:
```jsx
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
  <Card.Footer>Actions</Card.Footer>
</Card>
```

Or with slots:
```jsx
function Card({ children, title, actions }) {
  return (
    <div className="card">
      <header className="card__header">{title}</header>
      <div className="card__body">{children}</div>
      {actions && <footer className="card__footer">{actions}</footer>}
    </div>
  )
}
```

## Hooks to Know
- `useState` — local state
- `useEffect` — side effects, cleanup
- `useRef` — DOM references, mutable values
- `useMemo` / `useCallback` — memoization
- `useContext` — shared state
- `useReducer` — complex state logic

## Styling Integration
- CSS Modules: `import styles from './Button.module.css'` → `className={styles.btn}`
- Plain CSS: `import './globals.css'`
- Tailwind: `className="px-4 py-2 bg-blue-500 hover:bg-blue-600"`
- Inline: `style={{ color: '#3b82f6' }}` (avoid, use classes)

## File Naming
- Components: `Button.jsx`, `Button.tsx` (PascalCase)
- Files: `button.jsx` or `Button.jsx` (both common)
- CSS: `Button.module.css`, `globals.css`, `index.css`
- Tests: `Button.test.jsx`, `Button.spec.tsx`

## State Ownership (Golden Rule)
Find the topmost component that needs the data, own the state there, pass down as props. Lift state up when siblings need to share data.