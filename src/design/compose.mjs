/**
 * Composition — decides *what goes where* before any markup is written.
 *
 * A page is a sequence of sections, each with a purpose, a layout variant and a
 * content budget. The composer derives this from the project kind, the task type and
 * the request, then fills content slots with specific copy (never lorem ipsum).
 */

const SECTION_LIBRARY = {
  nav: { purpose: 'orientation', layouts: ['minimal-links', 'split-cta', 'with-status'], density: 'low' },
  hero: { purpose: 'focal statement', layouts: ['asymmetric-split', 'centered-stage', 'editorial-type', 'product-led'], density: 'high' },
  proof: { purpose: 'credibility', layouts: ['logo-row', 'metric-row', 'quote-led'], density: 'low' },
  features: { purpose: 'capability detail', layouts: ['alternating', 'bento', 'list-with-icons', 'three-column'], density: 'high' },
  showcase: { purpose: 'demonstration', layouts: ['side-by-side', 'full-bleed-figure', 'before-after'], density: 'high' },
  process: { purpose: 'explain how', layouts: ['numbered-steps', 'timeline'], density: 'medium' },
  pricing: { purpose: 'decision', layouts: ['two-tier', 'three-tier', 'single-plan'], density: 'medium' },
  testimonials: { purpose: 'social proof', layouts: ['single-quote', 'quotes-grid'], density: 'medium' },
  faq: { purpose: 'objection handling', layouts: ['disclosure-list'], density: 'medium' },
  cta: { purpose: 'conversion', layouts: ['band', 'inline-panel'], density: 'low' },
  footer: { purpose: 'closure', layouts: ['columns', 'minimal'], density: 'low' },
  form: { purpose: 'task completion', layouts: ['single-column-card', 'split-with-context'], density: 'medium' },
  stats: { purpose: 'scale evidence', layouts: ['inline-figures'], density: 'low' },
  demo: { purpose: 'component demonstration', layouts: ['component-stage'], density: 'low' },
};

const RECIPES = {
  'landing-page': ['nav', 'hero', 'proof', 'features', 'showcase', 'testimonials', 'cta', 'footer'],
  'marketing-site': ['nav', 'hero', 'proof', 'features', 'showcase', 'pricing', 'testimonials', 'faq', 'cta', 'footer'],
  'static-page': ['nav', 'hero', 'features', 'cta', 'footer'],
  'web-app': ['nav', 'hero', 'features', 'cta', 'footer'],
  'product-app': ['nav', 'features', 'cta', 'footer'],
  'component-library': ['hero', 'features', 'footer'],
  'auth-flow': ['form'],
  empty: ['nav', 'hero', 'features', 'cta', 'footer'],
};

const TASK_SECTIONS = {
  login: ['form'],
  signin: ['form'],
  signup: ['form'],
  hero: ['nav', 'hero', 'proof', 'cta'],
  button: [],
  card: [],
  pricing: ['nav', 'pricing', 'faq', 'cta', 'footer'],
  dashboard: ['nav', 'stats', 'features'],
  component: [],
};

const SECTION_ORDER = ['nav', 'hero', 'proof', 'stats', 'features', 'showcase', 'process', 'pricing', 'testimonials', 'faq', 'cta', 'footer', 'form'];

/**
 * @returns {{kind: string, sections: Array<object>, notes: string[], requestedSections: string[]}}
 */
export function composePage({ request = '', taskType = 'create-page', projectKind = 'landing-page', direction, subject = {}, wants = [] } = {}) {
  const notes = [];
  const wanted = detectRequestedSections(request, wants);
  let types = wanted.length ? wanted : (RECIPES[projectKind] ?? RECIPES['landing-page']);

  if (taskType === 'create-component') {
    const demo = composeComponentDemo({ request, direction, subject, notes });
    return demo;
  }
  if (['enhance', 'motion', 'responsive', '3d'].includes(taskType)) {
    notes.push('enhancement task: composition preserved, only targeted layers touched');
  }

  const sections = types.map((type, index) => {
    const spec = SECTION_LIBRARY[type] ?? SECTION_LIBRARY.features;
    const layout = pickLayout(type, spec.layouts, direction);
    return {
      id: `${type}-${index + 1}`,
      type,
      layout,
      purpose: spec.purpose,
      density: spec.density,
      content: contentFor(type, { request, subject, direction, layout }),
    };
  });

  if (projectKind === 'landing-page' && !sections.some((section) => ['showcase', 'testimonials', 'process', 'proof'].includes(section.type))) {
    notes.push('composition lacks a credibility section — the page would read as a template');
  }

  return { kind: projectKind, sections, notes, requestedSections: wanted };
}

function detectRequestedSections(request, wants = []) {
  const haystack = String(request).toLowerCase();
  const found = new Set(wants);
  for (const [key, types] of Object.entries(TASK_SECTIONS)) {
    if (haystack.includes(key)) types.forEach((type) => found.add(type));
  }
  if (/pricing|plans/.test(haystack)) found.add('pricing');
  if (/testimonial|review/.test(haystack)) found.add('testimonials');
  if (/faq|questions/.test(haystack)) found.add('faq');
  if (/dashboard|analytics/.test(haystack)) { found.add('stats'); found.add('features'); }
  if (/footer/.test(haystack)) found.add('footer');
  if (/nav|header/.test(haystack)) found.add('nav');
  return SECTION_ORDER.filter((type) => found.has(type));
}

function pickLayout(type, layouts, direction) {
  if (!direction) return layouts[0];
  if (type === 'hero') {
    if (['editorial-serif', 'boutique-craft'].includes(direction.id) && layouts.includes('editorial-type')) return 'editorial-type';
    if (['luxury-minimal', 'aurora-depth'].includes(direction.id) && layouts.includes('centered-stage')) return 'centered-stage';
    if (direction.id === 'kinetic-bold' && layouts.includes('product-led')) return 'product-led';
    return layouts.includes('asymmetric-split') ? 'asymmetric-split' : layouts[0];
  }
  if (type === 'features') {
    if (['swiss-grid', 'precision-dark', 'terminal-mono'].includes(direction.id)) return 'list-with-icons';
    if (direction.id === 'aurora-depth') return 'bento';
  }
  if (type === 'nav' && ['precision-dark', 'terminal-mono'].includes(direction.id)) return 'with-status';
  return layouts[0];
}

/* --------------------------------------------------------------- content ---- */

const SUBJECT_PATTERNS = [
  { re: /(login|sign[- ]?in|log in)/i, subject: 'Sign in', domain: 'account access' },
  { re: /(sign[- ]?up|register|create account)/i, subject: 'Create account', domain: 'onboarding' },
  { re: /(coffee|roaster|espresso)/i, subject: 'Coffee', domain: 'speciality coffee' },
  { re: /(hotel|resort|boutique stay)/i, subject: 'Stay', domain: 'hospitality' },
  { re: /(portfolio|designer|photographer|studio)/i, subject: 'Work', domain: 'creative portfolio' },
  { re: /(saas|platform|tool|dashboard|product)/i, subject: 'Platform', domain: 'software' },
  { re: /(restaurant|menu|kitchen|bakery)/i, subject: 'Kitchen', domain: 'food & drink' },
  { re: /(fitness|gym|training|workout)/i, subject: 'Training', domain: 'health & fitness' },
  { re: /(course|learn|school|academy)/i, subject: 'Course', domain: 'education' },
  { re: /(travel|tour|trip|destination)/i, subject: 'Journey', domain: 'travel' },
];

/** Derive a subject/domain from the request so copy is specific, not generic. */
export function deriveSubject(request, { fallback = 'Project' } = {}) {
  const text = String(request ?? '');
  for (const pattern of SUBJECT_PATTERNS) {
    if (pattern.re.test(text)) return { subject: pattern.subject, domain: pattern.domain, matchedOn: pattern.re.source };
  }
  const quoted = text.match(/["\u201c\u201d']([^"'\u201c\u201d]{3,40})["\u201c\u201d']/);
  if (quoted) return { subject: quoted[1], domain: 'brand', matchedOn: 'quoted' };
  const propers = [...text.matchAll(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2})\b/g)];
  for (const proper of propers) {
    if (!/^(Build|Make|Create|Add|Redesign|The|And|With|Use)$/.test(proper[1])) {
      return { subject: proper[1], domain: 'brand', matchedOn: 'proper-noun' };
    }
  }
  return { subject: fallback, domain: 'general', matchedOn: 'fallback' };
}

function headlineFor(subject, direction) {
  const templates = {
    'editorial-serif': [`${subject}, considered`, `The ${subject.toLowerCase()} issue`],
    'precision-dark': [`${subject}, precisely`, `Run ${subject.toLowerCase()} without guesswork`],
    'soft-product': [`${subject}, made simple`, `A calmer way to handle ${subject.toLowerCase()}`],
    'luxury-minimal': [`${subject}, quietly`, 'Few things, done exceptionally'],
    'kinetic-bold': [`${subject.toUpperCase()}. LOUDER.`, `Make ${subject.toLowerCase()} impossible to ignore`],
    'swiss-grid': [`${subject}: systemised`, 'Clear information, no decoration'],
    'aurora-depth': [`${subject}, in depth`, `A deeper layer for ${subject.toLowerCase()}`],
    'terminal-mono': [`${subject.toLowerCase()} --init`, `$ ${subject.toLowerCase()} run --fast`],
    'humanist-airy': [`${subject}, thoughtfully`, 'Designed for real people, not screenshots'],
    'boutique-craft': [`${subject}, crafted`, 'Made slowly, made well'],
  };
  const pair = templates[direction?.id] ?? [subject, `Everything ${subject.toLowerCase()}, nothing else`];
  return pair;
}

/** Real content slots per section type. */
export function contentFor(type, { request = '', subject = {}, direction, layout } = {}) {
  const name = subject.subject ?? 'Project';
  const domain = subject.domain ?? 'general';
  const [headline, altHeadline] = headlineFor(name, direction);

  switch (type) {
    case 'nav':
      return { brand: name, links: navLinksFor(domain), cta: { label: ctaLabelFor(domain), href: '#start' } };
    case 'hero':
      return {
        eyebrow: eyebrowFor(domain, direction),
        headline,
        altHeadline,
        subhead: subheadFor(name, domain),
        primaryCta: { label: ctaLabelFor(domain), href: '#start' },
        secondaryCta: { label: 'See how it works', href: '#how' },
        layout,
        proofPoint: proofPointFor(domain),
      };
    case 'proof':
      return { label: 'Used by', items: ['Northwind', 'Halden & Co', 'Atlas Labs', 'Meridian', 'Kestrel'], metrics: metricsFor(domain) };
    case 'features':
      return { heading: 'What you actually get', items: featuresFor(name, domain) };
    case 'showcase':
      return { heading: 'See it in place', lead: showcaseLeadFor(domain), bullets: showcaseBulletsFor(domain) };
    case 'process':
      return { heading: 'How it works', steps: processStepsFor(domain) };
    case 'pricing':
      return { heading: 'Straightforward pricing', tiers: pricingTiersFor(domain) };
    case 'testimonials':
      return {
        heading: 'What people say',
        quotes: [
          { quote: testimonialFor(domain, 0), name: 'Dana Whitfield', role: `Head of ${podFor(domain)}` },
          { quote: testimonialFor(domain, 1), name: 'Tomas Reyes', role: 'Founder, Halden & Co' },
        ],
      };
    case 'faq':
      return { heading: 'Questions, answered', items: faqFor(domain) };
    case 'cta':
      return { heading: `Start with ${name}`, body: 'Set it up in minutes. Nothing to install, nothing to babysit.', cta: { label: ctaLabelFor(domain), href: '#start' } };
    case 'footer':
      return {
        brand: name,
        columns: [
          { title: 'Product', links: navLinksFor(domain).slice(0, 3) },
          { title: 'Company', links: ['About', 'Careers', 'Contact'] },
        ],
        note: `\u00a9 ${new Date().getFullYear()} ${name}. All rights reserved.`,
      };
    case 'stats':
      return { figures: metricsFor(domain) };
    case 'form':
      return formContentFor(domain, name);
    default:
      return { heading: type, body: String(request).slice(0, 160) };
  }
}
/* ---------------------------------------------------- content generators ---- */

function navLinksFor(domain) {
  const base = {
    'account access': ['Product', 'Security', 'Support'],
    hospitality: ['Rooms', 'Dining', 'Spa'],
    'creative portfolio': ['Work', 'About', 'Contact'],
    software: ['Product', 'Pricing', 'Docs'],
    'food & drink': ['Menu', 'Our story', 'Visit'],
    education: ['Courses', 'Teachers', 'Pricing'],
    travel: ['Destinations', 'Guides', 'Journal'],
  };
  return base[domain] ?? ['Product', 'How it works', 'Pricing'];
}

function ctaLabelFor(domain) {
  const labels = {
    'account access': 'Sign in',
    onboarding: 'Create account',
    hospitality: 'Check availability',
    'creative portfolio': 'Start a project',
    software: 'Start free',
    'food & drink': 'Book a table',
    education: 'Browse courses',
    travel: 'Plan a trip',
    'health & fitness': 'Start training',
  };
  return labels[domain] ?? 'Get started';
}

function eyebrowFor(domain, direction) {
  const byDomain = {
    'account access': 'Secure access',
    hospitality: 'Two nights, minimum',
    software: 'For teams that ship',
    education: 'Autumn intake',
  };
  const byDirection = {
    'editorial-serif': 'Issue 01',
    'precision-dark': 'v2.4 stable',
    'soft-product': 'New',
    'luxury-minimal': 'By invitation',
    'kinetic-bold': 'Now shipping',
    'swiss-grid': 'Information',
    'aurora-depth': 'Ambient',
    'terminal-mono': 'status: ready',
    'humanist-airy': 'Care',
    'boutique-craft': 'Small batch',
  };
  return byDomain[domain] ?? byDirection[direction?.id] ?? 'Introducing';
}

function subheadFor(name, domain) {
  const lines = {
    'account access': 'One place for credentials, sessions and devices. Passkeys supported.',
    onboarding: 'Set up your workspace once, then get out of the way of the work.',
    hospitality: 'Nine rooms, a courtyard, and breakfast until noon.',
    software: 'Everything your team needs to move quickly, without a mountain of configuration.',
    'creative portfolio': 'Selected projects, process notes, and a little about how I work.',
    'food & drink': 'Seasonal plates, a short wine list, and bread baked every morning.',
    education: 'Structured courses with real feedback, not passive video.',
    travel: 'Routes built around the hours you actually have.',
  };
  return lines[domain] ?? `${name} in one considered place. Clear, fast, and built to be used.`;
}

function proofPointFor(domain) {
  const points = {
    software: 'SOC 2 Type II &middot; 99.98% uptime',
    'account access': 'Passkeys &middot; 2FA &middot; Session control',
    hospitality: '4.9 average across 1,240 stays',
    'creative portfolio': '12 years, 40+ shipped projects',
  };
  return points[domain] ?? 'Trusted by teams in 12 countries';
}

function metricsFor(domain) {
  const presets = {
    software: [{ value: '48ms', label: 'median response' }, { value: '99.98%', label: 'uptime' }, { value: '12k', label: 'teams' }],
    hospitality: [{ value: '9', label: 'rooms' }, { value: '4.9', label: 'guest rating' }, { value: '1,240', label: 'stays' }],
    'food & drink': [{ value: '6am', label: 'first bake' }, { value: '14', label: 'farm partners' }, { value: '2019', label: 'opened' }],
    'creative portfolio': [{ value: '40', label: 'projects shipped' }, { value: '12', label: 'years' }, { value: '8', label: 'awards' }],
  };
  return presets[domain] ?? [{ value: '3.2x', label: 'faster to launch' }, { value: '41%', label: 'less busywork' }, { value: '12k', label: 'teams onboard' }];
}
function featuresFor(name, domain) {
  const presets = {
    software: [
      { title: 'Set up in minutes', body: 'Import what you have, keep what works, and be productive the same afternoon.' },
      { title: 'Readable by default', body: 'Dense information arranged so the next action is obvious.' },
      { title: 'Nothing to babysit', body: 'Managed infrastructure with sensible limits and honest alerts.' },
    ],
    'account access': [
      { title: 'Passkeys first', body: 'Phishing-resistant sign-in, with a fallback that is still sane.' },
      { title: 'Session control', body: 'See every device and revoke any of them in one click.' },
      { title: 'Auditable', body: 'Every access event is logged, exportable and reviewable.' },
    ],
    hospitality: [
      { title: 'Rooms with daylight', body: 'Nine rooms, each with a window that opens and a bath that is not tiny.' },
      { title: 'Courtyard breakfast', body: 'Bread, fruit and good coffee until noon, every day.' },
      { title: 'Quick to settle in', body: 'Check-in in ninety seconds; the wifi does not need a form.' },
    ],
  };
  return presets[domain] ?? [
    { title: 'Built for the real workflow', body: 'No unused features, no empty states that dead-end.' },
    { title: 'Detail in the details', body: 'States, focus rings, loading and errors are designed, not defaulted.' },
    { title: 'Fast where it counts', body: 'The first interaction is instant; heavy work stays off the critical path.' },
  ];
}

function showcaseLeadFor(domain) {
  const leads = {
    software: 'The same surface for planning, executing and reviewing. Less tab-switching, more finished work.',
    hospitality: 'A building from 1892 with wifi that behaves like it is from 2025.',
    'account access': 'Sign-in that stays out of the way: one tap on your device, or a password if you prefer.',
  };
  return leads[domain] ?? 'A close look at how it behaves when you actually use it, with real content and real constraints.';
}

function showcaseBulletsFor(domain) {
  const presets = {
    software: ['Keyboard-first navigation', 'State survives a reload', 'Errors explain the fix'],
    'account access': ['Passkey and password parity', 'Device-level session revocation', 'No email round-trips to sign in'],
  };
  return presets[domain] ?? ['Responsive down to 390px', 'Reduced-motion respected', 'Contrast checked against WCAG AA'];
}

function processStepsFor(domain) {
  const presets = {
    software: [
      { title: 'Connect', body: 'Point it at your existing tools. No migration weekend required.' },
      { title: 'Configure', body: 'Set the handful of things that matter and leave the rest alone.' },
      { title: 'Ship', body: 'Work moves, and the dashboard tells you what changed while you were away.' },
    ],
  };
  return presets[domain] ?? [
    { title: 'Describe the outcome', body: 'Start from what should be true when this is finished.' },
    { title: 'Do the smallest useful version', body: 'One strong idea, finished properly, before adding a second.' },
    { title: 'Refine against evidence', body: 'Measure it, watch someone use it, then improve the weakest part.' },
  ];
}

function pricingTiersFor() {
  return [
    { name: 'Starter', price: '19', currency: 'EUR', cadence: 'per month', features: ['1 workspace', '5 seats', 'Community support'], featured: false },
    { name: 'Team', price: '49', currency: 'EUR', cadence: 'per month', features: ['Unlimited workspaces', '25 seats', 'Priority support', 'Audit log'], featured: true },
    { name: 'Scale', price: 'Custom', currency: '', cadence: 'annual', features: ['SSO & SCIM', 'Dedicated region', 'Solution engineer'], featured: false },
  ];
}

function testimonialFor(domain, index) {
  const quotes = {
    software: [
      'We cut our release checklist from forty items to six, and we ship more often.',
      'The first tool here that designers and engineers both actually open every day.',
    ],
    hospitality: [
      'The only hotel where I have slept properly before a speaking slot.',
      'Breakfast in the courtyard is worth the trip on its own.',
    ],
  };
  const fallback = [
    'It looked considered on the first screen, and it still does after six months of use.',
    'Nothing flashy. It does exactly what it says, quickly.',
  ];
  return (quotes[domain] ?? fallback)[index] ?? fallback[0];
}
function faqFor() {
  return [
    { q: 'How long does setup take?', a: 'Most teams are working within an hour; nothing requires a migration window.' },
    { q: 'Can I keep my existing stack?', a: 'Yes. It reads what you already have and leaves your tooling in place.' },
    { q: 'What happens to my data if I leave?', a: 'Full export in open formats, on demand, without a support ticket.' },
  ];
}

function podFor(domain) {
  const pods = { software: 'Engineering', hospitality: 'Guest Experience', 'account access': 'Platform Security' };
  return pods[domain] ?? 'Operations';
}

function formContentFor(domain, name) {
  const isSignup = domain === 'onboarding';
  return {
    action: '#',
    title: isSignup ? `Create your ${name} account` : `Sign in to ${name}`,
    subtitle: isSignup ? 'Two minutes, no credit card.' : 'Use your email and password, or a passkey.',
    fields: [
      { name: 'email', label: 'Email', type: 'email', autocomplete: 'email', placeholder: 'you@company.com', required: true },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        autocomplete: isSignup ? 'new-password' : 'current-password',
        placeholder: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022',
        required: true,
        hint: isSignup ? 'At least 10 characters.' : undefined,
      },
      ...(isSignup ? [{ name: 'name', label: 'Full name', type: 'text', autocomplete: 'name', placeholder: 'Dana Whitfield', required: true }] : []),
    ],
    remember: isSignup ? undefined : { label: 'Keep me signed in', name: 'remember' },
    submit: { label: isSignup ? 'Create account' : 'Sign in' },
    secondary: { label: 'Continue with passkey', kind: 'passkey' },
    footnote: isSignup ? 'By continuing you agree to the Terms and the Privacy Policy.' : 'Forgot your password?',
    sidePanel: {
      heading: 'Everything in one place',
      bullets: ['Session control across devices', 'Passkeys and 2FA', 'Export your data anytime'],
    },
  };
}

export const SECTION_TYPES = Object.keys(SECTION_LIBRARY);
export const SECTIONS_IN_ORDER = SECTION_ORDER;

/* ---------------------------------------------------- component demo ---- */

const COMPONENT_KINDS = ['button', 'card', 'badge', 'input', 'field', 'toggle', 'checkbox', 'navbar', 'modal', 'tag'];

/** Which component is the request actually about? */
export function detectComponentKind(request = '') {
  const text = String(request).toLowerCase();
  for (const kind of COMPONENT_KINDS) {
    if (new RegExp(`\\b${kind}s?\\b`).test(text)) return kind === 'field' ? 'input' : kind;
  }
  return 'button';
}

/** A component task still ships something runnable: a demo stage with every state. */
export function composeComponentDemo({ request = '', direction, subject = {}, notes = [] } = {}) {
  const component = detectComponentKind(request);
  const label = component.charAt(0).toUpperCase() + component.slice(1);
  notes.push(`component-scoped task: emitting a demo stage for "${component}" with its full state story`);
  const section = {
    id: 'demo-1',
    type: 'demo',
    layout: 'component-stage',
    purpose: 'component demonstration',
    density: 'low',
    content: {
      component,
      heading: `${label}, in every state it will ever be in`,
      sub: 'Rest, hover, focus-visible, disabled and loading are all designed from the same tokens — not defaulted.',
      note: 'Tab through the controls to see the focus ring. Reduced-motion users get the same page, still.',
    },
  };
  return { kind: 'component-demo', component, sections: [section], notes, requestedSections: ['demo'] };
}