/**
 * Copy layer — specificity instead of filler.
 *
 * The specificity test (see skills/copywriting): if a competitor could paste the
 * line onto their own page unchanged, it is filler. "Everything your team needs
 * to move quickly" fails. "Read the whole codebase. Ship the right change."
 * passes, because it names the mechanism.
 *
 * Copy is composed from four inputs:
 *   - the brand (taken from the brief when stated, coined deterministically otherwise)
 *   - a domain lexicon: the real nouns, actors and artifacts of the subject
 *   - the domain family: a system you operate (tech) or a practice you experience (craft)
 *   - the art direction's voice: editorial | severe | technical | warm | direct
 */

import { shortHash } from '../core/util.mjs';

/* ------------------------------------------------------------------ brand ---- */

const NAME_POOLS = {
  'developer tool': ['Lattice', 'Kernel', 'Foundry', 'Vantage', 'Halyard', 'Quarry', 'Anvil', 'Cadence'],
  ai: ['Lattice', 'Prism', 'Corvid', 'Sable', 'Vesper', 'Aperture', 'Verity', 'Umbra'],
  software: ['Meridian', 'Northwind', 'Arbor', 'Citadel', 'Kestrel', 'Fathom', 'Harbor', 'Lumen'],
  'account access': ['Keyhouse', 'Passgate', 'Threshold', 'Sentry', 'Latchkey'],
  onboarding: ['Firstrun', 'Threshold', 'Onward', 'Doorway', 'Daylight'],
  finance: ['Ledgerline', 'Sterling', 'Northbank', 'Tessera', 'Vaultworks'],
  'creative portfolio': ['Atelier Nine', 'Grainline', 'Colophon', 'Marginal', 'Pressform'],
  design: ['Atelier Nine', 'Grainline', 'Colophon', 'Pressform', 'Letterpress'],
  'speciality coffee': ['Ember & Oak', 'Saltbrook Roasters', 'Mill & Marrow', 'Copperpan', 'Stonefruit'],
  'food & drink': ['Ember & Oak', 'Saltbrook', 'Mill & Marrow', 'The Copper Pan', 'Bread & Bone'],
  hospitality: ['The Alder', 'Courtyard Nine', 'Maison Rive', 'The Quietwater', 'Stonehouse'],
  education: ['Cohort', 'Praxis', 'Lyceum', 'Fieldnote', 'Workbench'],
  'health & fitness': ['Groundwork', 'Steadfast', 'The Long Run', 'Bramble', 'Keelhaus'],
  travel: ['Waypoint', 'Slow Lane', 'The Long Way', 'Meridian Routes', 'Farside'],
  hardware: ['Halyard', 'Kern & Sons', 'Anvil Supply', 'Solothurn Works', 'Meridian Instruments'],
  general: ['Meridian', 'Arbor', 'Lumen', 'Kestrel', 'Fathom', 'Cadence', 'Vantage', 'Northwind'],
};

/** A name the brief actually states: quoted, "called X", "named X", or a clear proper noun. */
export function brandFromRequest(request = '') {
  const text = String(request ?? '');
  const called = text.match(/\b(?:called|named|for)\s+["“']([^"”']{2,40})["”']/i) ?? text.match(/\b(?:called|named)\s+([A-Z][\w&'.-]*(?:\s+(?:&|and|of|the)?\s*[A-Z][\w&'.-]*){0,3})/);
  if (called) return called[1].trim();
  // "the launch site for Halyard, a company that…" — a company named in passing.
  // The lookahead is what keeps "for AI developer tool" from becoming a brand.
  const forNamed = text.match(/\bfor\s+([A-Z][\w'.-]{2,}(?:\s+(?:&|and|of|the)?\s*[A-Z][\w'.-]+){0,2})(?=\s*[,.]|\s+(?:that|who|which|sells|makes|a\s|an\s|the\s))/);
  if (forNamed && !/^(AI|API|SaaS|UI|UX|The|A|An)$/i.test(forNamed[1])) return forNamed[1].trim();
  const quoted = text.match(/["“']([^"”']{2,40})["”']/);
  if (quoted && /[A-Za-z]/.test(quoted[1]) && !/\b(page|site|website|app|landing)\b/i.test(quoted[1])) return quoted[1].trim();
  return '';
}

/** Stable, non-generic name for a product the brief never named. */
export function coinBrand(request = '', domain = 'general') {
  const pool = NAME_POOLS[domain] ?? NAME_POOLS.general;
  const seed = parseInt(shortHash(`${domain}:${String(request).slice(0, 160)}`).slice(0, 6), 16);
  return pool[seed % pool.length];
}

/**
 * Generic nouns the composer derives from a brief ("Codebase", "Platform") are
 * subjects, not identities — a page that calls itself Codebase reads as a template.
 */
export function isPlaceholderBrand(name) {
  const value = String(name ?? '').trim();
  if (!value) return true;
  return /^(project|platform|artisan|product|company|brand|codebase|model|work|kitchen|journey|course|training|coffee|stay|sign in|create account|dashboard|app|site|tool|page|object|device|hardware|your (brand|company|product))$/i.test(value);
}

/* ---------------------------------------------------------------- lexicon ---- */

/**
 * family: 'tech'  — something you operate (the claim is about mechanism)
 *         'craft' — something you experience (the claim is about practice and place)
 */
const LEXICONS = {
  ai: { family: 'tech', unit: 'codebase', actor: 'engineering lead', artifact: 'answer', action: 'ship', pain: 'answers that ignore the rest of the system', figures: [['100%', 'answers cite real lines'], ['8k', 'files indexed per minute'], ['3', 'clicks to a reviewable diff']] },
  'developer tool': { family: 'tech', unit: 'repository', actor: 'staff engineer', artifact: 'pull request', action: 'ship', pain: 'reviews that stall for three days', figures: [['41%', 'fewer review cycles'], ['1.2s', 'median index time'], ['120', 'repositories in production']] },
  software: { family: 'tech', unit: 'workspace', actor: 'operations lead', artifact: 'workflow', action: 'run', pain: 'configuration that outlives the person who wrote it', figures: [['12 min', 'to first value'], ['99.98%', 'uptime over 90 days'], ['24', 'integrations, no glue code']] },
  'account access': { family: 'tech', unit: 'account', actor: 'security lead', artifact: 'session', action: 'verify', pain: 'password resets at 2am', figures: [['0', 'passwords stored'], ['2 taps', 'to sign in with a passkey'], ['30 days', 'session audit history']] },
  onboarding: { family: 'tech', unit: 'workspace', actor: 'new teammate', artifact: 'setup', action: 'start', pain: 'a first week spent reading stale wikis', figures: [['9 min', 'median setup'], ['1', 'link to invite a team'], ['0', 'config files to edit']] },
  finance: { family: 'tech', unit: 'ledger', actor: 'controller', artifact: 'reconciliation', action: 'close', pain: 'month-end that eats a week', figures: [['2 days', 'to close the books'], ['SOC 2', 'Type II'], ['0', 'spreadsheets required']] },
  'speciality coffee': { family: 'craft', unit: 'roastery', actor: 'roaster', artifact: 'bag', action: 'roast', pain: 'coffee that sat in a warehouse for a season', place: 'a railway arch in Bermondsey', ritual: 'roasted Tuesday, shipped Wednesday', figures: [['48h', 'from roast to post'], ['3', 'farms, named on every bag'], ['14 day', 'rotating single origin']] },
  'food & drink': { family: 'craft', unit: 'kitchen', actor: 'head baker', artifact: 'menu', action: 'serve', pain: 'menus that never change', place: 'a corner site with fourteen seats', ritual: 'bread out of the oven before six', figures: [['6am', 'bread out of the oven'], ['14', 'seats'], ['40 miles', 'furthest supplier']] },
  hospitality: { family: 'craft', unit: 'house', actor: 'innkeeper', artifact: 'stay', action: 'host', pain: 'hotels that feel like airports', place: 'nine rooms around a courtyard', ritual: 'breakfast until noon, no exceptions', figures: [['4.9', 'across 1,240 stays'], ['9', 'rooms'], ['until noon', 'breakfast is served']] },
  'creative portfolio': { family: 'craft', unit: 'studio', actor: 'art director', artifact: 'project', action: 'make', pain: 'portfolios that look like everyone else’s', place: 'a two-person studio', ritual: 'one project at a time', figures: [['12', 'years of practice'], ['40+', 'shipped projects'], ['1', 'project at a time']] },
  design: { family: 'craft', unit: 'studio', actor: 'art director', artifact: 'identity', action: 'make', pain: 'design that could belong to anyone', place: 'a two-person studio', ritual: 'one project at a time', figures: [['12', 'years of practice'], ['40+', 'identities shipped'], ['4', 'disciplines in house']] },
  education: { family: 'craft', unit: 'cohort', actor: 'instructor', artifact: 'critique', action: 'teach', pain: 'video courses nobody finishes', place: 'a live room of sixteen', ritual: 'work reviewed every Thursday', figures: [['78%', 'finish the cohort'], ['1:6', 'instructor ratio'], ['9', 'weeks, live']] },
  'health & fitness': { family: 'craft', unit: 'gym', actor: 'coach', artifact: 'programme', action: 'train', pain: 'programmes written for someone else’s body', place: 'one room, barbells and chalk', ritual: 'every session logged and reviewed', figures: [['1:1', 'programme review'], ['12', 'week blocks'], ['0', 'contracts']] },
  travel: { family: 'craft', unit: 'route', actor: 'guide', artifact: 'itinerary', action: 'travel', pain: 'itineraries built for photographs, not hours', place: 'routes you can do in a long weekend', ritual: 'no more than two moves a week', figures: [['3 days', 'minimum route'], ['2', 'moves per week, maximum'], ['18', 'routes, all walked']] },
  hardware: { family: 'craft', unit: 'workshop', actor: 'machinist', artifact: 'unit', action: 'make', pain: 'products designed for a spec sheet instead of a hand', place: 'a machine shop with four people in it', ritual: 'every unit measured and signed before it ships', figures: [['1', 'model, no variants'], ['5 year', 'warranty, parts included'], ['48', 'parts, all replaceable']] },
  general: { family: 'tech', unit: 'workspace', actor: 'team lead', artifact: 'project', action: 'run', pain: 'tools that make you do their filing', figures: [['1', 'afternoon to set up'], ['99.9%', 'uptime'], ['12', 'countries']] },
};

export function lexiconFor(domain = 'general') { return LEXICONS[domain] ?? LEXICONS.general; }

/* --------------------------------------------------------------- templates ---- */

function cap(text) { const s = String(text ?? ''); return s.charAt(0).toUpperCase() + s.slice(1); }

const TECH = {
  editorial: {
    heads: (b, l) => [`Read the whole ${l.unit}. ${cap(l.action)} the right change.`, `The ${l.unit}, finally legible.`],
    lede: (b, l) => `${b} maps every module, test and dependency you already have, so each ${l.artifact} lands in context instead of in a vacuum.`,
    eyebrow: (b, l) => `For the ${l.actor} who inherited the ${l.unit}`,
    cta: { primary: `Point it at a ${'repository'}`, secondary: 'Read how it works' },
  },
  severe: {
    heads: (b, l) => [`Every ${l.artifact}, grounded in the ${l.unit}.`, `No guesses. Just the ${l.unit}.`],
    lede: (b, l) => `${b} refuses to answer without the ${l.unit} in front of it. Every claim points at the lines that back it.`,
    eyebrow: () => 'Grounded, or silent',
    cta: { primary: 'Run it on your own code', secondary: 'See the method' },
  },
  technical: {
    heads: (b, l) => [`${b} indexes the ${l.unit}, then answers with citations.`, `${cap(l.unit)}-aware from the first ${l.artifact}.`],
    lede: (b, l) => `${b} builds a typed graph of the ${l.unit} — modules, call sites, tests, ownership — and resolves every ${l.artifact} against it.`,
    eyebrow: (b, l) => `${l.unit} graph · v2.4`,
    cta: { primary: 'Start indexing', secondary: 'Read the docs' },
  },
  warm: {
    heads: (b, l) => [`Work through the ${l.unit} without losing the thread.`, `A calmer way to ${l.action} the ${l.artifact}.`],
    lede: (b, l) => `${b} keeps the whole ${l.unit} in view, so your ${l.actor} stops holding it all in their head.`,
    eyebrow: (b, l) => `Built with ${l.actor}s`,
    cta: { primary: 'Try it on one project', secondary: 'See an example' },
  },
  direct: {
    heads: (b, l) => [`${l.action.toUpperCase()} THE ${l.unit.toUpperCase()}.`, `Stop fighting the ${l.unit}.`],
    lede: (b, l) => `${b} reads the ${l.unit}, finds ${l.pain}, and hands you a ${l.artifact} you can review in a minute.`,
    eyebrow: () => 'Now shipping',
    cta: { primary: 'Start free', secondary: 'Watch the demo' },
  },
};

const CRAFT = {
  editorial: {
    heads: (b, l) => [`${cap(l.ritual ?? l.action)}. Nothing else.`, `${b}, from ${l.place ?? 'one room'}.`],
    lede: (b, l) => `${b} works out of ${l.place ?? 'one small room'}: ${l.ritual ?? `${l.artifact}s made to order`}, and a short list of things done properly.`,
    eyebrow: (b, l) => `${cap(l.unit)} · ${l.figures[1][0]} ${l.figures[1][1]}`,
    cta: { primary: 'See what is on', secondary: 'How we work' },
  },
  severe: {
    heads: (b, l) => [`One ${l.unit}. ${cap(l.ritual ?? 'One standard')}.`, `No ${l.pain}.`],
    lede: (b, l) => `${b} does one thing: ${l.ritual ?? `${l.action} with care`}. Everything that does not serve that is gone.`,
    eyebrow: () => 'One standard, held',
    cta: { primary: 'Order', secondary: 'The standard' },
  },
  technical: {
    heads: (b, l) => [`Every ${l.artifact}, documented: ${l.figures[2][0]} ${l.figures[2][1]}.`, `${b}: process, not mystique.`],
    lede: (b, l) => `${b} publishes the whole process — sources, timings, and who did the work. Vagueness is where ${l.pain} hides.`,
    eyebrow: (b, l) => `${l.figures[0][0]} ${l.figures[0][1]}`,
    cta: { primary: 'See the process', secondary: 'Read the notes' },
  },
  warm: {
    heads: (b, l) => [`${cap(l.ritual ?? l.action)} — and a seat saved for you.`, `${b}. Come in.`],
    lede: (b, l) => `${b} is ${l.place ?? 'a small place'}. ${cap(l.ritual ?? `The ${l.artifact} is made properly`)}. Come for one, stay for the afternoon.`,
    eyebrow: (b, l) => `${cap(l.place ?? l.unit)}`,
    cta: { primary: 'Book a table', secondary: 'See the menu' },
  },
  direct: {
    heads: (b, l) => [`${cap(l.ritual ?? l.action).toUpperCase()}.`, `${b.toUpperCase()}. ${l.figures[0][0].toUpperCase()} ${l.figures[0][1].toUpperCase()}.`],
    lede: (b, l) => `${b}: ${l.ritual ?? l.action}, ${l.figures[0][0]} ${l.figures[0][1]}, no waiting list.`,
    eyebrow: () => 'Open now',
    cta: { primary: 'Get yours', secondary: 'See it' },
  },
};

const SECTION_COPY = {
  tech: {
    editorial: { features: ['Three moves', 'How the work actually changes'], showcase: ['In place', 'What it looks like on a real project'], process: ['Method', 'Index, reason, ship'], testimonials: ['Said out loud', 'What the people using it say'], cta: ['Begin', 'Point it at one project'] },
    severe: { features: ['Mechanics', 'What it does, precisely'], showcase: ['Evidence', 'One real run, unedited'], process: ['Sequence', 'Index. Reason. Ship.'], testimonials: ['On the record', 'Unedited, attributed'], cta: ['Start', 'Run it on your own work'] },
    technical: { features: ['Capabilities', 'What ships in v2.4'], showcase: ['Output', 'A diff produced by the graph'], process: ['Pipeline', 'From clone to citation'], testimonials: ['Field reports', 'From teams running it in production'], cta: ['Install', 'Index your first project'] },
    warm: { features: ['What you get', 'Three things that change on day one'], showcase: ['A look inside', 'The same project, before and after'], process: ['How it goes', 'Three steps, no migration'], testimonials: ['In their words', 'What people tell us after a month'], cta: ['Get started', 'Bring one project'] },
    direct: { features: ['The short version', 'Three reasons it sticks'], showcase: ['Proof', 'Real output, no mockups'], process: ['How', 'Three steps'], testimonials: ['Reviews', 'Straight from users'], cta: ['Go', 'Start now'] },
  },
  craft: {
    editorial: { features: ['Three things', 'What we actually do'], showcase: ['The room', 'Where the work happens'], process: ['Method', 'How it is made'], testimonials: ['Said out loud', 'What regulars tell us'], cta: ['Visit', 'Come and see'] },
    severe: { features: ['The standard', 'What we refuse to compromise'], showcase: ['The room', 'No styling, no props'], process: ['Method', 'Exactly how it is made'], testimonials: ['On the record', 'Unedited'], cta: ['Order', 'While it lasts'] },
    technical: { features: ['Specification', 'Sources, timings, people'], showcase: ['Documentation', 'Photographed as found'], process: ['Process', 'Step by step, with numbers'], testimonials: ['Field notes', 'From people who bought it'], cta: ['Order', 'Choose a batch'] },
    warm: { features: ['What to expect', 'Three things people come back for'], showcase: ['Have a look', 'The room, on an ordinary morning'], process: ['How it works', 'Simple as it sounds'], testimonials: ['In their words', 'What regulars say'], cta: ['Come in', 'Book a seat'] },
    direct: { features: ['Why', 'Three reasons'], showcase: ['Look', 'No filters'], process: ['How', 'Three steps'], testimonials: ['Reviews', 'Straight from regulars'], cta: ['Get it', 'Order now'] },
  },
};

const FEATURES = {
  tech: {
    editorial: (b, l) => [
      { title: 'Index', body: `Every module, test and owner becomes a typed graph in about a minute.` },
      { title: 'Reason', body: `Questions are answered against that graph, with citations to the exact lines.` },
      { title: cap(l.action), body: `Changes arrive as a reviewable ${l.artifact} with the tests that prove them.` },
    ],
    severe: (b, l) => [
      { title: 'Grounded', body: `No ${l.artifact} leaves without a file and a line number behind it.` },
      { title: 'Bounded', body: `It sees the ${l.unit} and nothing else. Your work is never used for training.` },
      { title: 'Reviewable', body: `Output is a diff, not prose. You approve it or you do not.` },
    ],
    technical: (b, l) => [
      { title: 'Typed graph', body: `Modules, call sites, tests and ownership, refreshed on every push.` },
      { title: 'Citations', body: `Each claim resolves to a path and a line range you can open.` },
      { title: 'CI native', body: `Runs as a check, comments on the ${l.artifact}, exits non-zero when it should.` },
    ],
    warm: (b, l) => [
      { title: 'It reads first', body: `Before suggesting anything, it reads the ${l.unit} the way a new colleague would.` },
      { title: 'It shows its work', body: `Every suggestion comes with the files it looked at.` },
      { title: 'It stays out of the way', body: `No migration, no new editor, no meetings about tooling.` },
    ],
    direct: (b, l) => [
      { title: 'Fast', body: `${l.figures[1][0]} ${l.figures[1][1]}.` },
      { title: 'Grounded', body: `Cites real lines. Never invents a path.` },
      { title: 'Reviewable', body: `Ships a ${l.artifact}, not a wall of text.` },
    ],
  },
  craft: {
    editorial: (b, l) => [
      { title: 'Sourced', body: `${l.figures[1][0]} ${l.figures[1][1]} — named, not implied.` },
      { title: 'Made here', body: `${cap(l.ritual ?? `Made in ${l.unit}`)}.` },
      { title: 'Short list', body: `We do fewer things than we could, and all of them properly.` },
    ],
    severe: (b, l) => [
      { title: 'One standard', body: `${cap(l.ritual ?? 'One way of doing it')}. No shortcuts on a busy day.` },
      { title: 'No padding', body: `No ${l.pain}. Nothing on the list to fill space.` },
      { title: 'Finite', body: `${l.figures[0][0]} ${l.figures[0][1]}. When it is gone it is gone.` },
    ],
    technical: (b, l) => [
      { title: 'Provenance', body: `${l.figures[1][0]} ${l.figures[1][1]}, documented on every ${l.artifact}.` },
      { title: 'Timing', body: `${cap(l.ritual ?? 'Made to a schedule')}.` },
      { title: 'Numbers', body: `${l.figures[0][0]} ${l.figures[0][1]}, measured, not estimated.` },
    ],
    warm: (b, l) => [
      { title: 'A small place', body: `${cap(l.place ?? 'One room')}, run by people you will recognise.` },
      { title: 'Made today', body: `${cap(l.ritual ?? 'Made fresh')}.` },
      { title: 'No fuss', body: `Come as you are. ${l.figures[1][0]} ${l.figures[1][1]}, and no ceremony about it.` },
    ],
    direct: (b, l) => [
      { title: 'Fresh', body: `${cap(l.ritual ?? 'Made today')}.` },
      { title: 'Local', body: `${l.figures[2][0]} ${l.figures[2][1]}.` },
      { title: 'Limited', body: `${l.figures[0][0]} ${l.figures[0][1]}.` },
    ],
  },
};

/**
 * Full copy set for a page.
 * @param {{brand?: string, domain?: string, voice?: string, request?: string, variant?: number}} input
 */
export function copyFor({ brand, domain = 'general', voice = 'editorial', request = '', variant = 0 } = {}) {
  const lex = lexiconFor(domain);
  const family = lex.family ?? 'tech';
  const stated = brand && !isPlaceholderBrand(brand) ? String(brand).trim() : brandFromRequest(request);
  const name = stated && !isPlaceholderBrand(stated) ? stated : coinBrand(request, domain);
  const coined = !(stated && !isPlaceholderBrand(stated));
  const table = family === 'craft' ? CRAFT : TECH;
  const v = table[voice] ? voice : 'editorial';
  const t = table[v];
  const heads = t.heads(name, lex);
  const section = SECTION_COPY[family][v];
  return {
    brand: name,
    coined,
    family,
    voice: v,
    eyebrow: t.eyebrow(name, lex),
    headline: heads[variant % heads.length],
    altHeadline: heads[(variant + 1) % heads.length],
    lede: t.lede(name, lex),
    primaryCta: { label: t.cta.primary, href: '#start' },
    secondaryCta: { label: t.cta.secondary, href: '#how' },
    // The nav needs a short label; the hero can afford the full phrase.
    navCta: { label: t.cta.primary.length > 14 ? (family === 'craft' ? 'Visit' : 'Start') : t.cta.primary, href: '#start' },
    // The closing line must belong to this domain, not to a software template.
    ctaBody: family === 'craft'
      ? `${cap(lex.ritual ?? `Made in the ${lex.unit}`)}. ${lex.figures[1][0]} ${lex.figures[1][1]}.`
      : `${lex.figures[0][0]} ${lex.figures[0][1]}. No migration, nothing to babysit.`,
    proofPoint: `${lex.figures[0][0]} ${lex.figures[0][1]} · ${lex.figures[1][0]} ${lex.figures[1][1]}`,
    rail: lex.figures.map(([figure, label]) => `${figure} ${label}`),
    figureLabel: `${cap(lex.unit)}`,
    figures: lex.figures,
    features: FEATURES[family][v](name, lex),
    sections: section,
    title: `${name} — ${heads[0].replace(/\s+/g, ' ').replace(/[.!]+$/, '')}`,
    description: t.lede(name, lex),
  };
}

/** Split a headline so the display face can italicise one clause (the signature move). */
export function headlineClauses(headline) {
  const text = String(headline ?? '').trim();
  const match = text.match(/^(.+?[.,—])\s*(.+)$/);
  if (!match) return { lead: text, tail: '' };
  return { lead: match[1].trim(), tail: match[2].trim() };
}
