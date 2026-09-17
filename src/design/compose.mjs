/**
 * Composition — decides *what goes where* before any markup is written.
 *
 * A page is a sequence of sections, each with a purpose, a layout variant and a
 * content budget. The composer derives this from the project kind, the task type and
 * the request, then fills content slots with specific copy (never lorem ipsum).
 */

import { positiveText } from './negation.mjs';
import { copyFor, isPlaceholderBrand, lexiconFor } from './copy.mjs';
import { navLinksForSections } from './emit-site.mjs';

const SECTION_LIBRARY = {
  nav: { purpose: 'orientation', layouts: ['minimal-links', 'split-cta', 'with-status'], density: 'low' },
  hero: { purpose: 'focal statement', layouts: ['asymmetric-split', 'centered-stage', 'editorial-type', 'product-led'], density: 'high' },
  proof: { purpose: 'credibility', layouts: ['logo-row', 'metric-row', 'quote-led'], density: 'low' },
  features: { purpose: 'capability detail', layouts: ['alternating', 'bento', 'list-with-icons', 'three-column'], density: 'high' },
  showcase: { purpose: 'demonstration', layouts: ['side-by-side', 'full-bleed-figure', 'before-after'], density: 'high' },
  process: { purpose: 'explain how', layouts: ['numbered-steps', 'timeline'], density: 'medium' },
  spec: { purpose: 'specification', layouts: ['specification-table'], density: 'medium' },
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

const SECTION_ORDER = ['nav', 'hero', 'proof', 'stats', 'features', 'showcase', 'process', 'spec', 'pricing', 'testimonials', 'faq', 'cta', 'footer', 'form'];

/**
 * @returns {{kind: string, sections: Array<object>, notes: string[], requestedSections: string[]}}
 */
export function composePage({ request = '', taskType = 'create-page', projectKind = 'landing-page', direction, subject = {}, wants = [], artDirection, lockedSections } = {}) {
  const notes = [];
  const detected = detectRequestedSections(request, wants);
  // A refinement edits the page that exists. Re-deriving the plan from a
  // refine brief ("Do it.") loses the enumeration that shaped the create
  // pass, and the dropped pricing tiers and FAQ come straight back.
  const locked = (lockedSections ?? []).filter((type) => SECTION_LIBRARY[type]);
  const wanted = detected.types;
  const recipe = RECIPES[projectKind] ?? RECIPES['landing-page'];
  // An exclusive request ("a login page") replaces the recipe. Sections the brief
  // asks for by name ("the specification, then one closing action") EXTEND it —
  // dropping the frame is how a page ended up with no nav, no hero and no footer.
  let types = recipe;
  if (locked.length) {
    types = SECTION_ORDER.filter((type) => new Set(locked).has(type));
    notes.push(`section plan kept from the existing build: ${types.join(', ')}`);
  } else if (wanted.length) {
    if (detected.exclusive) {
      // "a login page" / "a component" IS the whole page. Anything else still
      // needs its frame: a brief that merely mentions "dashboard" was losing
      // its nav, hero and footer.
      const selfContained = wanted.some((type) => ['form', 'demo'].includes(type));
      types = selfContained ? wanted : SECTION_ORDER.filter((type) => new Set([...wanted, 'nav', 'hero', 'footer']).has(type));
      notes.push(selfContained
        ? `sections replaced by the request: ${types.join(', ')}`
        : `requested sections kept inside the page frame: ${types.join(', ')}`);
    } else if (detected.enumerated) {
      // The brief listed the page. Keep the frame plus what it asked for and
      // nothing else: a brief that says "the mechanism, the specification, one
      // quote, one closing action" must not also ship pricing tiers and an FAQ.
      const frame = new Set([...wanted, 'nav', 'hero', 'footer']);
      types = SECTION_ORDER.filter((type) => frame.has(type));
      notes.push(`the brief enumerates the page; recipe extras dropped: ${recipe.filter((type) => !frame.has(type)).join(', ') || 'none'}`);
    } else {
      types = SECTION_ORDER.filter((type) => new Set([...recipe, ...wanted]).has(type));
      notes.push(`sections requested and added to the ${projectKind} frame: ${wanted.join(', ')}`);
    }
  }

  if (taskType === 'create-component') {
    const demo = composeComponentDemo({ request, direction, subject, notes });
    return demo;
  }
  if (['enhance', 'motion', 'responsive', '3d'].includes(taskType)) {
    notes.push('enhancement task: composition preserved, only targeted layers touched');
  }

  const sections = types.map((type, index) => {
    const spec = SECTION_LIBRARY[type] ?? SECTION_LIBRARY.features;
    const layout = type === 'hero' && artDirection ? artDirection.composition : pickLayout(type, spec.layouts, direction);
    return {
      id: `${type}-${index + 1}`,
      type,
      layout,
      purpose: spec.purpose,
      density: spec.density,
      content: contentFor(type, { request, subject, direction, layout }),
    };
  });

  // The nav is the only section whose content depends on the others: it may only
  // link to sections that survived planning. Built here, once the plan is final.
  if (projectKind === 'landing-page' && !sections.some((section) => ['showcase', 'testimonials', 'process', 'proof'].includes(section.type))) {
    notes.push('composition lacks a credibility section — the page would read as a template');
  }

  /**
   * Every internal link must land on a section that exists.
   *
   * Run on BOTH return paths: the art-direction pass returns early, and when
   * this only ran on the other path the page shipped a nav of dead anchors, a
   * hero CTA pointing at "#start" (an id nothing emitted) and six inert "#"
   * links in the footer.
   */
  const resolveInternalLinks = () => {
    const derived = navLinksForSections(sections.map((section) => section.type));
    const navSection = sections.find((section) => section.type === 'nav');
    if (navSection) {
      navSection.content.links = derived;
      notes.push(derived.length
        ? `nav links follow the section plan: ${derived.map((l) => l.href).join(' ')}`
        : 'nav has no links: no section on this page carries an anchor');
    }
    const footerSection = sections.find((section) => section.type === 'footer');
    if (footerSection && Array.isArray(footerSection.content.columns)) {
      footerSection.content.columns = footerSection.content.columns
        .map((column, index) => (index === 0 ? { ...column, links: derived } : column))
        .filter((column) => (column.links ?? []).length);
    }
    // A secondary "see how it works" action lands on whichever explanatory
    // section survived: the showcase owns "#how", the three moves "#how-it-works".
    const explanatory = derived.find((link) => link.href === '#how' || link.href === '#how-it-works');
    for (const section of sections) {
      const secondary = section.content?.secondaryCta;
      if (!secondary) continue;
      if (explanatory) secondary.href = explanatory.href;
      else delete section.content.secondaryCta;
    }
  };

  // The art direction owns the copy voice and the brand: replace the generic
  // template copy with domain-specific lines (see design/copy.mjs).
  if (artDirection) {
    // Only a name the brief actually stated ("called X", quoted, or a proper noun)
    // may be used as the brand; a derived common noun gets a coined identity.
    const named = ['quoted', 'proper-noun'].includes(subject.matchedOn) ? subject.subject : '';
    const copy = copyFor({ brand: named, domain: subject.domain, voice: artDirection.voice, request });
    notes.push(`copy: ${copy.voice} voice, brand "${copy.brand}" (${named && !isPlaceholderBrand(named) ? 'from the brief' : 'coined — the brief named none'})`);
    notes.push('figures in the copy are plausible placeholders — replace them with real measurements before launch');
    for (const section of sections) {
      const c = section.content;
      switch (section.type) {
        case 'nav': c.brand = copy.brand; c.cta = { ...(copy.navCta ?? copy.primaryCta) }; break;
        case 'hero':
          Object.assign(c, {
            eyebrow: copy.eyebrow, headline: copy.headline, altHeadline: copy.altHeadline, subhead: copy.lede,
            primaryCta: { ...copy.primaryCta }, secondaryCta: { ...copy.secondaryCta }, proofPoint: copy.proofPoint,
            rail: copy.rail, figureLabel: copy.figureLabel, layout: artDirection.composition,
          });
          break;
        case 'features': c.label = copy.sections.features[0]; c.heading = copy.sections.features[1]; c.items = copy.features; break;
        case 'showcase': c.label = copy.sections.showcase[0]; c.heading = copy.sections.showcase[1]; break;
        case 'process': c.heading = copy.sections.process[1]; break;
        case 'cta': c.heading = copy.sections.cta[1]; c.body = copy.ctaBody; c.cta = { ...copy.primaryCta }; break;
        case 'proof': c.label = 'By the numbers'; c.items = []; c.metrics = copy.figures.map(([value, label]) => ({ value, label })); break;
        case 'footer': c.brand = copy.brand; c.note = `© ${new Date().getFullYear()} ${copy.brand}.`; break;
        case 'testimonials': if (copy.sections.testimonials) { c.label = copy.sections.testimonials[0]; c.heading = copy.sections.testimonials[1]; } break;
        default: break;
      }
    }
    resolveInternalLinks();
    return { kind: projectKind, sections, notes, requestedSections: wanted, copy, title: copy.title, brand: copy.brand };
  }

  resolveInternalLinks();
  return { kind: projectKind, sections, notes, requestedSections: wanted };
}

function detectRequestedSections(request, wants = []) {
  // Only the user's own words decide the sections. A composed brief appends the
  // rendered agreed context, and its field labels ("Hero: …") were being read as
  // a request for a hero-only recipe.
  const primary = String(request).split(/\n\s*AGREED DESIGN CONTEXT/i)[0].split(/\n\s*\[?agreed (?:design )?context/i)[0];
  // Sections come from what the brief ASKS for. Matching the raw text reads its
  // rejections as requests: "no three-identical-cards features section" was
  // adding a features grid, and the page kept growing the very sections the
  // brief ruled out. The full text still decides the enumeration test below,
  // because "then" and "below that" are structure words, not wants.
  const haystack = positiveText(primary).toLowerCase();
  const structure = primary.toLowerCase();
  const found = new Set(wants);
  // The narrative the brief asks for, in its own language. Additive: these name
  // sections to include, they do not describe the whole page.
  if (/\bhow (it|they) (is|are) made\b|\bprocess\b|\bhow it works\b|\bmethod\b/.test(haystack)) found.add('process');
  if (/\bmechanism\b|\bin (?:three|3|four|4|five|5) (?:moves|steps|stages)\b|\bstep by step\b/.test(haystack)) found.add('process');
  // "Specification" belongs to the spec table below, not here. Routing it to a
  // features grid is what made a brief that asked for a specification table get
  // three cards instead, and then fail its own coverage check.
  if (/\bwhat it is\b|\bfeatures?\b|\bwhat you get\b|\bcapabilit/.test(haystack)) found.add('features');
  // A specification table is a table. Folding it into 'features' is why the
  // coverage gate reported a missing table on every build: nothing could make one.
  if (/\bspecification\b|\bspecs?\b|\bdata ?sheet\b|\btechnical (?:detail|figure)/.test(haystack)) found.add('spec');
  if (/\bnumbers?\b|\bmetrics?\b|\bproof\b|\bevidence\b/.test(haystack)) found.add('proof');
  if (/\bclosing action\b|\bcall to action\b|\bcta\b|\bone action\b/.test(haystack)) found.add('cta');
  if (/\bwho it(?:'s| is) for\b|\baudience\b|\btestimonial|\bquote/.test(haystack)) found.add('testimonials');
  // An exclusive ask names the artefact ITSELF: "a login page", "a pricing
  // page", "just a hero section". A brief that merely describes one of its
  // sections ("the hero should state what the machine does") is not asking for a
  // hero-only page — matching the bare word was adding a credibility logo row to
  // a brief that had already enumerated its own five sections.
  let exclusive = false;
  const ASK_HEAD = String.raw`\b(?:just |only |simply )?(?:a|an|the)?\s*`;
  const ASK_TAIL = String.raw`\s+(?:page|screen|view|section|component|flow|form)\b`;
  const ASK_VERB = String.raw`\b(?:build|make|create|design|need|want)\s+(?:me\s+)?(?:a|an|the)?\s*`;
  for (const [key, types] of Object.entries(TASK_SECTIONS)) {
    if (!types.length) continue;
    const named = new RegExp(ASK_HEAD + key + ASK_TAIL, 'i').test(haystack)
      || new RegExp(ASK_VERB + key + String.raw`\b`, 'i').test(haystack);
    if (!named) continue;
    types.forEach((type) => found.add(type));
    exclusive = true;
  }
  if (/pricing|plans/.test(haystack)) found.add('pricing');
  if (/testimonial|review/.test(haystack)) found.add('testimonials');
  if (/faq|questions/.test(haystack)) found.add('faq');
  if (/dashboard|analytics/.test(haystack)) { found.add('stats'); found.add('features'); }
  if (/footer/.test(haystack)) found.add('footer');
  if (/nav|header/.test(haystack)) found.add('nav');
  // Did the brief lay out the page itself? "Open with X, then Y, then the
  // specification, and one closing action" is a table of contents, and adding a
  // recipe's pricing tiers and FAQ accordion on top of it produces exactly the
  // generic marketing page the brief was trying to avoid.
  const enumerated = found.size >= 3 && /\b(?:open with|start with|below that|after that|then)\b/.test(structure);
  return { types: SECTION_ORDER.filter((type) => found.has(type)), exclusive, enumerated };
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
  // Specific technical domains must win over the generic "software" bucket:
  // matching "tool" first is what produced the placeholder brand "Platform".
  { re: /\b(ai|llm|genai|copilot|agentic|machine learning)\b[^.]{0,40}\b(developer|dev|coding|engineering|code)\b|\b(developer|coding|code)\b[^.]{0,30}\b(ai|llm|copilot|assistant)\b/i, subject: 'Codebase', domain: 'ai' },
  { re: /\b(developer tool|devtool|dev tool|cli|sdk|api|codebase|repository|repo|ci\/cd|pull request|code review)\b/i, subject: 'Codebase', domain: 'developer tool' },
  // A named physical object outranks the loose "ai|model" bucket below it. A
  // brief about a film scanner is about a machine even when it also says the
  // word "model", and matching one loose token first is how a hand-built
  // instrument became a page about typed graphs.
  { re: /\b(keyboard|hardware|device|camera|scanner|lens|optic(?:s|al)?|film|turntable|watch|speaker|headphone|amplifier|furniture|chair|lamp|bicycle|bike|instrument|machined|machinist|enclosure|lathe|mechanism|hand-?(?:built|made|assembled)|workshop|machine shop)\b/i, subject: 'Object', domain: 'hardware' },
  { re: /\b(ai|llm|genai|neural|model)\b/i, subject: 'Model', domain: 'ai' },
  { re: /(saas|platform|tool|dashboard|product)/i, subject: 'Platform', domain: 'software' },
  { re: /(restaurant|menu|kitchen|bakery)/i, subject: 'Kitchen', domain: 'food & drink' },
  { re: /(fitness|gym|training|workout)/i, subject: 'Training', domain: 'health & fitness' },
  { re: /(course|learn|school|academy)/i, subject: 'Course', domain: 'education' },
  { re: /(travel|tour|trip|destination)/i, subject: 'Journey', domain: 'travel' },
];

/**
 * Derive the subject AND the domain from the request.
 *
 * The domain always comes from the pattern table, even when the brief names a
 * brand: a stated name told us what to call the product, not what it is. Reading
 * the name first is what gave a mechanical-keyboard brief software copy about
 * typed graphs and pull requests.
 */
export function deriveSubject(request, { fallback = 'Project' } = {}) {
  const text = String(request ?? '');
  // Match on what the brief ASKS FOR. "Absolutely no AI-SaaS look" is the
  // strongest AI signal in its own text, and reading it as a request is how a
  // brief for a hand-built film scanner produced a page about indexing a
  // codebase with citations. A rejection is not a request.
  const wanted = positiveText(text);
  const matched = SUBJECT_PATTERNS.find((pattern) => pattern.re.test(wanted));
  const domain = matched?.domain ?? 'general';

  // A name the brief states explicitly wins as the subject.
  const called = text.match(/\b(?:called|named)\s+["\u201c']?([A-Z][\w&'.-]*(?:\s+(?:&|and|of|the)?\s*[A-Z][\w&'.-]*){0,3})["\u201d']?/);
  if (called) return { subject: called[1].trim(), domain, matchedOn: 'quoted' };
  const quoted = text.match(/["\u201c\u201d']([^"'\u201c\u201d]{3,40})["\u201c\u201d']/);
  if (quoted && !/\b(page|site|website|app|landing)\b/i.test(quoted[1])) return { subject: quoted[1], domain, matchedOn: 'quoted' };

  if (matched) return { subject: matched.subject, domain, matchedOn: matched.re.source };

  const propers = [...text.matchAll(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2})\b/g)];
  for (const proper of propers) {
    if (!/^(Build|Make|Create|Add|Redesign|The|And|With|Use|Design|Implement)$/.test(proper[1])) {
      return { subject: proper[1], domain, matchedOn: 'proper-noun' };
    }
  }
  return { subject: fallback, domain, matchedOn: 'fallback' };
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
    case 'spec':
      return { heading: 'Specification', caption: name + ' — measured figures', rows: specRowsFor(domain, name) };
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

/**
 * Rows for a specification table: the domain's own measured figures first,
 * then the units that family is actually specified in. Every value is concrete
 * — a table of "Fast / Yes / Included" is not a specification.
 */
function specRowsFor(domain, name) {
  const lex = lexiconFor(domain);
  const rows = (lex.figures ?? []).map(([value, label]) => ({ label: label.charAt(0).toUpperCase() + label.slice(1), value }));
  const extra = lex.family === 'craft'
    ? [
        { label: 'Made in', value: lex.place ?? 'the workshop' },
        { label: 'Build', value: lex.ritual ?? 'assembled and measured by hand' },
        { label: 'Lead time', value: '6–8 weeks from order' },
        { label: 'Serviceable', value: 'yes, parts held for ten years' },
      ]
    : [
        { label: 'Deploys to', value: 'your own infrastructure or ours' },
        { label: 'Data residency', value: 'EU or US, chosen per workspace' },
        { label: 'Interfaces', value: 'HTTP API, CLI, ' + (lex.unit ?? 'workspace') + ' webhooks' },
        { label: 'Support', value: 'same-day, from the people who build it' },
      ];
  return [...rows, ...extra].slice(0, 7);
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

/**
 * The steps a "how it works" section shows.
 *
 * A brief that asks for "the mechanism explained in three moves" wants the
 * mechanism, not a product-development process. With only a `software` preset
 * here, a hand-built film scanner shipped "Describe the outcome / Do the
 * smallest useful version / Refine against evidence" — copy that would suit any
 * product in any industry, which is the definition of filler.
 */
function processStepsFor(domain) {
  const presets = {
    software: [
      { title: 'Connect', body: 'Point it at your existing tools. No migration weekend required.' },
      { title: 'Configure', body: 'Set the handful of things that matter and leave the rest alone.' },
      { title: 'Ship', body: 'Work moves, and the dashboard tells you what changed while you were away.' },
    ],
    'developer tool': [
      { title: 'Install', body: 'One command. It reads the project you already have instead of asking you to restructure it.' },
      { title: 'Run', body: 'It works against your real code, not a sample repository, and shows what it changed.' },
      { title: 'Review', body: 'Every change arrives as a diff you approve, with the reasoning attached.' },
    ],
    hardware: [
      { title: 'Machined', body: 'The chassis is cut from one billet, so nothing can shift out of alignment later.' },
      { title: 'Assembled', body: 'Built by one person at one bench, who signs the unit before it leaves.' },
      { title: 'Measured', body: 'Every unit is put on the test rig and ships with its own recorded figures.' },
    ],
    ai: [
      { title: 'Reads', body: 'It indexes the material you point it at and keeps the references.' },
      { title: 'Proposes', body: 'You get a plan you can argue with before anything is changed.' },
      { title: 'Shows its working', body: 'Every answer carries the source it came from, so it can be checked.' },
    ],
    'food & drink': [
      { title: 'Sourced', body: 'One grower, one harvest, named on the bag with the date it was picked.' },
      { title: 'Roasted', body: 'In small batches, to a profile written for that lot rather than a house curve.' },
      { title: 'Shipped', body: 'Within two days of roasting, because the difference is obvious in the cup.' },
    ],
    'speciality coffee': [
      { title: 'Sourced', body: 'One grower, one harvest, named on the bag with the date it was picked.' },
      { title: 'Roasted', body: 'In small batches, to a profile written for that lot rather than a house curve.' },
      { title: 'Shipped', body: 'Within two days of roasting, because the difference is obvious in the cup.' },
    ],
    'health & fitness': [
      { title: 'Assessed', body: 'A baseline you can see, taken before anything is prescribed.' },
      { title: 'Programmed', body: 'A plan built around the time you actually have, not an ideal week.' },
      { title: 'Adjusted', body: 'Reviewed against what you recorded, and changed when the numbers say so.' },
    ],
    education: [
      { title: 'Placed', body: 'A short diagnostic puts you at the right level instead of at lesson one.' },
      { title: 'Taught', body: 'Small groups with one instructor who sees your work every week.' },
      { title: 'Assessed', body: 'Marked against the standard you are working toward, with the gap named.' },
    ],
    'creative portfolio': [
      { title: 'Brief', body: 'One conversation to agree what the work has to do before anything is designed.' },
      { title: 'Direction', body: 'Two routes, each argued for, and one chosen together.' },
      { title: 'Delivery', body: 'Files, sources and the reasoning, so the work can be carried on without me.' },
    ],
    hospitality: [
      { title: 'Arrive', body: 'Check in at the bar rather than a desk. Your room is already open.' },
      { title: 'Stay', body: 'Fourteen rooms, so the kitchen knows how you take your coffee by the second morning.' },
      { title: 'Return', body: 'The same room, held for you, if you want it.' },
    ],
    travel: [
      { title: 'Planned', body: 'A route built around what you want to see, with the timings that make it possible.' },
      { title: 'Booked', body: 'Everything held under one reference, with one person to call.' },
      { title: 'Supported', body: 'Someone in the timezone you are in, for the whole trip.' },
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