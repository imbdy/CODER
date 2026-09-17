import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requirementsFromBrief, checkRequirements, copyFindings } from '../../src/verify/requirements.mjs';

const BRIEF = [
  'Build the site for Cassini Instruments, a company that makes a single hand-built film scanner.',
  'Below that I want the mechanism explained in three moves, a specification table with real figures,',
  'one quote from a working archivist, and a single closing action.',
].join(' ');

/** A render where only some of the brief was delivered. */
function renderWith(structures = {}, copy = {}) {
  return {
    ok: true,
    viewports: [{
      name: 'desktop',
      metrics: {
        structures: { tables: 0, tableRows: 0, definitionLists: 0, blockquotes: 0, citations: 0, orderedLists: 0, orderedItems: 0, forms: 0, navLinks: 0, landmarkSections: 4, headingTexts: [], ...structures },
        copy: { fillerHits: [], words: 300, h1Text: 'A real headline', ctaLabels: [], genericCtaLabels: [], ...copy },
      },
    }],
  };
}

describe('brief coverage', () => {
  it('reads the requirements the brief actually states', () => {
    const ids = requirementsFromBrief(BRIEF).map((r) => r.id);
    assert.deepEqual(ids.sort(), ['closing-action', 'quote', 'spec-table', 'steps']);
    // nothing is invented for a brief that asks for none of it
    assert.deepEqual(requirementsFromBrief('a quiet one-page site for a bakery').map((r) => r.id), []);
    // the appended context block must not add requirements of its own
    const withBlock = requirementsFromBrief(`make it calmer\n\nAGREED DESIGN CONTEXT\nLayout: a specification table and a quote`);
    assert.deepEqual(withBlock.map((r) => r.id), []);
  });

  it('fails the requirement the page is missing and passes the rest', () => {
    const requirements = requirementsFromBrief(BRIEF);
    // table + quote + action present, stepped explanation absent: the exact gap
    // the live model left on its first attempt.
    const render = renderWith(
      { tables: 1, tableRows: 5, blockquotes: 1, citations: 1, headingTexts: ['Precision Scanning for Film Archives', 'Technical Specifications'] },
      { ctaLabels: ['Request a Demo'], genericCtaLabels: ['Request a Demo'] },
    );
    const { findings, met, missing } = checkRequirements(render, requirements);
    assert.deepEqual(missing, ['steps']);
    assert.deepEqual(met.sort(), ['closing-action', 'quote', 'spec-table']);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'major');
    assert.equal(findings[0].area, 'brief');
    assert.match(findings[0].evidence, /stepped explanation/);
  });

  it('accepts a stepped explanation by ordered list or by heading', () => {
    const requirements = requirementsFromBrief(BRIEF);
    const byList = checkRequirements(renderWith({ tables: 1, blockquotes: 1, orderedItems: 3 }, { ctaLabels: ['Order'] }), requirements);
    assert.ok(!byList.missing.includes('steps'));
    const byHeading = checkRequirements(renderWith({ tables: 1, blockquotes: 1, headingTexts: ['How it works'] }, { ctaLabels: ['Order'] }), requirements);
    assert.ok(!byHeading.missing.includes('steps'));
  });

  it('is silent when nothing was rendered, rather than guessing', () => {
    const { findings } = checkRequirements({ ok: false }, requirementsFromBrief(BRIEF));
    assert.deepEqual(findings, []);
  });
});

describe('copy quality on the rendered page', () => {
  it('flags filler, stock action labels and a page too thin to answer the brief', () => {
    const findings = copyFindings(renderWith({}, {
      fillerHits: ['everything you need', 'supercharge'],
      genericCtaLabels: ['Get Started', 'Learn More'],
      words: 40,
    }));
    const areas = findings.map((f) => `${f.severity}:${f.area}`);
    assert.ok(areas.includes('major:content'), JSON.stringify(findings));
    assert.ok(findings.some((f) => /filler copy/.test(f.evidence)));
    assert.ok(findings.some((f) => /generic action label/.test(f.evidence)));
    assert.ok(findings.some((f) => /too thin/.test(f.evidence)));
  });

  it('says nothing about copy that is specific and long enough', () => {
    assert.deepEqual(copyFindings(renderWith({}, { ctaLabels: ['Point it at a repository'], words: 420 })), []);
  });
});
