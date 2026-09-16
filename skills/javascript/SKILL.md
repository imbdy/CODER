---
name: javascript
category: implementation
priority: high
frameworks: []
libraries: []
triggers: [javascript, js, dom, event listener, fetch, async, promise, es6, modern js, vanilla js, script.js, interactivity, animation frame, intersection observer, resize observer, debouncing, throttling]
description: Modern JavaScript (ES6+) — DOM, events, fetch, async/await, animations, browser APIs.
---

# Modern JavaScript (ES6+)

When the project needs interactivity, animations, or data fetching:

## DOM Selection & Manipulation
```js
const button = document.querySelector('.btn')
const items = document.querySelectorAll('.item')

// Create/insert
const el = document.createElement('div')
el.textContent = 'Hello'
el.setAttribute('aria-expanded', 'true')
container.appendChild(el)
```

## Event Handling
```js
// Click
button.addEventListener('click', (e) => {
  e.preventDefault()
  // do something
})

// Keydown with ESC detection
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal()
})

// Form submit
form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const formData = new FormData(form)
  const data = Object.fromEntries(formData)
  await submit(data)
})
```

## Async / Fetch
```js
async function loadData(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

// Loading states
async function handleSubmit(form) {
  const button = form.querySelector('button')
  button.setAttribute('disabled', 'true')
  button.setAttribute('aria-busy', 'true')
  try {
    const data = await loadData('/api/submit')
    showSuccess(data)
  } catch (err) {
    showError(err.message)
  } finally {
    button.removeAttribute('disabled')
    button.removeAttribute('aria-busy')
  }
}
```

## Scroll-Driven Interactions (Intersection Observer)
```js
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('enter')
      observer.unobserve(entry.target)
    }
  })
}, { threshold: 0.12 })

document.querySelectorAll('[data-reveal]').forEach((el) => {
  observer.observe(el)
})
```

## Reduced Motion Guard
```js
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)')
if (!prefersReduced.matches) {
  // animations OK
}
```

## Micro-Animations (requestAnimationFrame)
```js
function smoothScrollTo(target) {
  const startY = window.scrollY
  const targetY = target.getBoundingClientRect().top + startY
  const distance = targetY - startY
  const duration = 800
  let start = null

  function step(timestamp) {
    if (!start) start = timestamp
    const progress = timestamp - start
    const pct = Math.min(progress / duration, 1)
    const ease = 1 - Math.pow(1 - pct, 3) // easeOutCubic
    window.scrollTo(0, startY + distance * ease)
    if (progress < duration) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
```

## State Patterns (no framework)
```js
// Simple state container
const state = {
  isOpen: false,
  toggle() {
    this.isOpen = !this.isOpen
    document.querySelector('.modal').hidden = !this.isOpen
  },
}

// Tab component
const tabs = document.querySelectorAll('[data-tab]')
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'))
    tab.classList.add('active')
    // show corresponding panel
  })
})
```

## Modern JS Features
- Destructuring: `const { name, age } = user`
- Spread/rest: `[...nodes]`, `{ ...defaults, ...overrides }`
- Arrow functions, template literals
- Optional chaining: `user?.profile?.name`
- Nullish coalescing: `const count = data.count ?? 0`
- Array methods: `.map()`, `.filter()`, `.reduce()`, `.find()`
- Modules: `import / export`