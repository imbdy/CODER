### step 0 — assistant

**think:** THINK: The goal is to create a dark, editorial, premium landing page for Ember & Oak. The page will have a hero section with the brand name and a CTA, three features, and a footer. The design should be intentional, with a strong focal point, clear hierarchy, and intentional whitespace. The project should follow the project-architecture rules, with separate files for HTML, CSS, and JavaScript.

<details><summary>raw output</summary>

```
THINK: The goal is to create a dark, editorial, premium landing page for Ember & Oak. The page will have a hero section with the brand name and a CTA, three features, and a footer. The design should be intentional, with a strong focal point, clear hierarchy, and intentional whitespace. The project should follow the project-architecture rules, with separate files for HTML, CSS, and JavaScript.

SKILLS NEEDED: frontend-master, project-architecture, visual-design, css

### index.html
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ember & Oak</title>
  <link rel="stylesheet" href="styles/main.css">
</head>
<body>
  <header class="hero">
    <div class="hero-content">
      <h1 class="hero-title">Ember & Oak</h1>
      <p class="hero-subtitle">Your premium coffee subscription</p>
      <button class="hero-cta">Get Started</button>
    </div>
  </header>
  <section class="features">
    <div class="feature">
      <h2 class="feature-title">Fresh Roast</h2>
      <p class="feature-description">Enjoy the finest coffee every day.</p>
    </div>
    <div class="feature">
      <h2 class="feature-title">Custom Blends</h2>
      <p class="feature-description">Create your own unique coffee blends.</p>
    </div>
    <div class="feature">
      <h2 class="feature-title">Delivery</h2>
      <p class="feature-description">Free shipping and convenient delivery.</p>
    </div>
  </section>
  <footer class="footer">
    <p class="footer-text">© 2023 Ember & Oak. All rights reserved.</p>
  </footer>
  <script type="module" src="scripts/main.js"></script>
</body>
</html>
```

### styles/main.css
```css
:root {
  --color-bg: #121212;
  --color-text: #ffffff;
  --color-accent: #ff6b6b;
  --font-sans: "Inter", system-ui, sans-serif;
  --font-display: "Fraunces", Georgia, serif;
  --radius-md: 16px;
  --space-4: 20px;
  --space-8: 40px;
  --space-12: 60px;
  --space-24: 96px;
  --text-base: 1rem;
  --text-3xl: clamp(1.875rem, 2rem + 0.5vw, 2.25rem);
}

body {
  margin: 0;
  padding: 0;
  font-family: var(--font-sans);
  background-color: var(--color-bg);
  color: var(--color-text);
}

.hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-12);
  align-items: center;
  min-height: 80vh;
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-bg) 100%);
  padding: 0 var(--space-24);
}

.hero-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: start;
}

.hero-title {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  line-height: 1;
  letter-spacing: -0.02em;
  margin-bottom: var(--space-4);
}

.hero-subtitle {
  font-size: var(--text-base);
  margin-bottom: var(--space-8);
}

.hero-cta {
  background-color: var(--color-accent);
  color: var(--color-bg);
  border: none;
  padding: 18px 32px;
  font-size: var(--text-base);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.hero-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.features {
  padding: var(--space-24) 0;
  background-color: var(--color-bg);
}

.feature {
  display: flex;
  flex-direction: column;
  align-items: start;
  padding: var(--space-8);
  background-color: var(--color-text);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-8);
}

.feature-title {
  font-size: var(--text-3xl);
  margin-bottom: var(--space-4);
}

.feature-description {
  font-size: var(--text-base);
}

.footer {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--space-24) 0;
  background-color: var(--color-bg);
}

.footer-text {
  font-size: var(--text-base);
  color: var(--color-text);
}
```

### scripts/main.js
```javascript
document.addEventListener('DOMContentLoaded', () => {
  // Add any JavaScript functionality here
});
```

```json
[
  {
    "done": true,
    "summary": "Landing page for Ember & Oak created with a hero section, three features, and a footer. The design follows the project-architecture rules with separate files for HTML, CSS, and JavaScript."
  }
]
```
```

</details>