/**
 * Brief coverage — did the build actually deliver what the brief asked for?
 *
 * A page can pass every structural, contrast and responsive check and still be
 * wrong, because the brief asked for "the mechanism explained in three moves, a
 * specification table, one quote from a working archivist and a single closing
 * action" and the build shipped three of those four. Static checks call that a
 * pass. This module turns the brief's own nouns into requirements and verifies
 * each one against the RENDERED dom.
 *
 * Deliberately conservative: a requirement is only raised when the brief asks
 * for it in plain language, and it is only failed when the rendered page has no
 * plausible structure for it.
 */

const REQUIREMENTS = [
  {
    id: 'spec-table',
    ask: /\b(specification|spec)\s*(table|sheet|list)\b|\btable of (specs|specifications)\b|\bspec table\b/i,
    label: 'a specification table',
    satisfied: (m) => (m.structures?.tables ?? 0) > 0 || (m.structures?.definitionLists ?? 0) > 0,
    detail: (m) => `tables: ${m.structures?.tables ?? 0}, definition lists: ${m.structures?.definitionLists ?? 0}`,
    fix: 'Add a real <table> (or <dl>) of parameters and values with figures, not prose.',
  },
  {
    id: 'quote',
    ask: /\b(one |a )?(quote|testimonial)\b|\bquote from\b|\bwhat (people|customers|users) say\b/i,
    label: 'a quote with attribution',
    satisfied: (m) => (m.structures?.blockquotes ?? 0) > 0,
    detail: (m) => `blockquotes: ${m.structures?.blockquotes ?? 0}, citations: ${m.structures?.citations ?? 0}`,
    fix: 'Add a <blockquote> with a <cite> naming the person and their role.',
  },
  {
    id: 'steps',
    ask: /\b(three|3|four|4|five|5) (moves|steps|stages|phases)\b|\bmechanism explained\b|\bhow it (is made|works)\b|\bstep by step\b|\bprocess\b/i,
    label: 'a stepped explanation (the mechanism / how it works)',
    satisfied: (m) => (m.structures?.orderedItems ?? 0) >= 2
      || (m.structures?.headingTexts ?? []).some((h) => /\b(mechanism|how it works|how it is made|process|method|step)\b/i.test(h)),
    detail: (m) => `ordered items: ${m.structures?.orderedItems ?? 0}, headings: ${(m.structures?.headingTexts ?? []).slice(0, 6).join(' / ')}`,
    fix: 'Add the stepped section the brief asks for: an <ol> of named moves, each with one line of explanation.',
  },
  {
    id: 'closing-action',
    ask: /\b(closing|final|single) (action|call to action|cta)\b|\bone action\b|\bcall to action\b/i,
    label: 'one closing action',
    satisfied: (m) => (m.copy?.ctaLabels ?? []).length > 0,
    detail: (m) => `actions found: ${(m.copy?.ctaLabels ?? []).join(', ') || 'none'}`,
    fix: 'End the page with exactly one action, labelled in the product\'s own language.',
  },
  {
    id: 'nav',
    ask: /\b(navigation|nav bar|navbar|header nav|menu)\b/i,
    label: 'navigation',
    satisfied: (m) => (m.structures?.navLinks ?? 0) >= 2,
    detail: (m) => `nav links: ${m.structures?.navLinks ?? 0}`,
    fix: 'Add a nav with the page anchors.',
  },
  {
    id: 'form',
    ask: /\b(newsletter|sign-?up form|contact form|email capture|subscribe)\b/i,
    label: 'a form',
    satisfied: (m) => (m.structures?.forms ?? 0) > 0,
    detail: (m) => `forms: ${m.structures?.forms ?? 0}`,
    fix: 'Add the form with a bound label, a hint and inline validation states.',
  },
  {
    id: 'pricing',
    ask: /\b(pricing|plans|tiers)\b/i,
    label: 'pricing',
    satisfied: (m) => (m.structures?.headingTexts ?? []).some((h) => /\b(pricing|plans?|tiers?|per month|from )\b/i.test(h)) || (m.structures?.tables ?? 0) > 0,
    detail: (m) => `headings: ${(m.structures?.headingTexts ?? []).slice(0, 6).join(' / ')}`,
    fix: 'Add the pricing section with real figures and one promoted option.',
  },
];

/** Requirements the brief actually states. */
export function requirementsFromBrief(text = '') {
  const brief = String(text ?? '');
  // Only the user's own words: a rendered context block would double-count.
  const primary = brief.split(/\n\s*AGREED DESIGN CONTEXT/i)[0];
  return REQUIREMENTS.filter((requirement) => requirement.ask.test(primary)).map(({ id, label, satisfied, detail, fix }) => ({ id, label, satisfied, detail, fix }));
}

/**
 * Check requirements against the measured render (desktop viewport).
 * @returns {{findings: object[], met: string[], missing: string[]}}
 */
export function checkRequirements(render, requirements = []) {
  const findings = [];
  const met = [];
  const missing = [];
  if (!render?.ok || !requirements.length) return { findings, met, missing };
  const metrics = render.viewports?.[0]?.metrics ?? {};
  for (const requirement of requirements) {
    let ok = false;
    try { ok = Boolean(requirement.satisfied(metrics)); } catch { ok = false; }
    if (ok) { met.push(requirement.id); continue; }
    missing.push(requirement.id);
    findings.push({
      area: 'brief',
      severity: 'major',
      evidence: `the brief asks for ${requirement.label}, and the rendered page has none (${requirement.detail(metrics)})`,
      fix: requirement.fix,
      source: 'requirements',
    });
  }
  return { findings, met, missing };
}

/** Copy that any competitor could paste unchanged, measured on the rendered page. */
export function copyFindings(render) {
  const findings = [];
  if (!render?.ok) return findings;
  const copy = render.viewports?.[0]?.metrics?.copy ?? {};
  if ((copy.fillerHits ?? []).length) {
    findings.push({ area: 'content', severity: 'major', evidence: `filler copy on the page: ${copy.fillerHits.join(', ')}`, fix: 'Rewrite those lines to name the mechanism or the specific benefit. If a competitor could paste it unchanged, it is not finished.', source: 'requirements' });
  }
  if ((copy.genericCtaLabels ?? []).length) {
    findings.push({ area: 'content', severity: 'minor', evidence: `generic action label(s): ${copy.genericCtaLabels.join(', ')}`, fix: 'Label the action in the product\'s own language ("Point it at a repository", "Order this week\'s roast") rather than a stock phrase.', source: 'requirements' });
  }
  if (copy.words !== undefined && copy.words < 90) {
    findings.push({ area: 'content', severity: 'major', evidence: `the whole page carries ${copy.words} words — too thin to answer the brief`, fix: 'Write the sections the brief asks for, with real copy in each.', source: 'requirements' });
  }
  return findings;
}
