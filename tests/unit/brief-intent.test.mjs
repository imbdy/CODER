/**
 * What a brief ASKS FOR versus what it RULES OUT, and the page plan that follows.
 *
 * Every case here is a regression from a real run: a brief for a hand-built film
 * scanner produced a page about indexing a codebase, a brief whose first demand
 * was "no purple" got a purple accent, and a brief that enumerated its own five
 * sections shipped with pricing tiers and an FAQ accordion on top of them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { clausesOf, splitPolarity, positiveText, negativeText } from '../../src/design/negation.mjs';
import { composePage, deriveSubject, contentFor } from '../../src/design/compose.mjs';
import { extractColorIntent } from '../../src/design/color.mjs';
import { renderSpec } from '../../src/design/emit-site.mjs';
import { createAgreedContext, recordBuild, extractContextHeuristically } from '../../src/runtime/agreed-context.mjs';

const CASSINI = [
  'Build the site for Cassini Instruments, a company that makes a single hand-built film scanner.',
  'I want it to feel like the instrument itself: precise, mechanical, quiet, expensive.',
  'Absolutely no AI-SaaS look, no purple, no glass, no floating gradients, no stock photography, and no three-identical-cards features section.',
  'The hero should state what the machine does in one sentence and show one specification.',
  'Below that I want the mechanism explained in three moves, a specification table with real figures, one quote from a working archivist, and a single closing action.',
].join(' ');

test('a brief is split into what it wants and what it rejects', async (t) => {
  await t.test('rejections do not stay in the positive text', () => {
    const { positive, negative } = splitPolarity(CASSINI);
    assert.match(positive, /hand-built film scanner/);
    assert.doesNotMatch(positive, /AI-SaaS/);
    assert.doesNotMatch(positive, /purple/);
    assert.match(negative, /AI-SaaS look/);
    assert.match(negative, /purple/);
  });

  await t.test('a rendered REJECTED: line counts as rejection, not request', () => {
    const { positive, negative } = splitPolarity('REJECTED: AI-SaaS look, purple, glass');
    assert.equal(positive, '');
    assert.match(negative, /purple/);
  });

  await t.test('clauses break on commas so a rejection cannot contaminate a want', () => {
    assert.deepEqual(clausesOf('quiet and expensive, no purple'), ['quiet and expensive', 'no purple']);
  });

  await t.test('a brief of nothing but rejections yields no positive signal', () => {
    assert.equal(positiveText('no purple, no glass'), '');
    assert.match(negativeText('no purple, no glass'), /purple/);
  });
});

test('the domain comes from the product, not from the rejections', async (t) => {
  await t.test('a hand-built film scanner is hardware, not AI', () => {
    // "Absolutely no AI-SaaS look" was the strongest AI signal in the text, and
    // the page it produced opened with "Cassini Instruments indexes the
    // codebase, then answers with citations."
    assert.equal(deriveSubject(CASSINI).domain, 'hardware');
  });

  await t.test('a genuine AI brief is still AI', () => {
    assert.equal(deriveSubject('Build a landing page for an AI coding assistant that reviews pull requests.').domain, 'ai');
  });

  await t.test('an unrelated rejection does not change the domain', () => {
    assert.equal(deriveSubject('A site for a speciality coffee roaster in Lisbon, no minimalism please.').domain, 'speciality coffee');
  });
});

test('an accent is taken from a request, never from a rejection', async (t) => {
  await t.test('a bare rejection list gives no accent', () => {
    assert.equal(extractColorIntent('REJECTED: AI-SaaS look, purple, glass'), undefined);
  });

  await t.test('prose rejections give no accent', () => {
    assert.equal(extractColorIntent('Absolutely no AI-SaaS look, no purple, no glass.'), undefined);
  });

  await t.test('a stated colour is still honoured', () => {
    assert.equal(extractColorIntent('I want a deep teal accent.')?.color, 'teal');
    assert.equal(extractColorIntent('Use a rust orange accent. No purple.')?.color, 'orange');
  });
});

test('a brief that enumerates the page gets that page', async (t) => {
  await t.test('recipe extras are dropped and the requested sections are built', () => {
    const page = composePage({ request: CASSINI, taskType: 'create-page', projectKind: 'marketing-site' });
    const types = page.sections.map((s) => s.type);
    assert.deepEqual(types, ['nav', 'hero', 'process', 'spec', 'testimonials', 'cta', 'footer']);
    for (const unwanted of ['pricing', 'faq', 'proof', 'showcase', 'features']) {
      assert.ok(!types.includes(unwanted), unwanted + ' was never asked for');
    }
  });

  await t.test('a specification table is a table section, not a features grid', () => {
    const page = composePage({ request: CASSINI, taskType: 'create-page', projectKind: 'marketing-site' });
    const spec = page.sections.find((s) => s.type === 'spec');
    assert.ok(spec, 'the brief asked for a specification table');
    assert.equal(spec.layout, 'specification-table');
    assert.ok(spec.content.rows.length >= 4, 'a specification needs real rows');
    for (const row of spec.content.rows) {
      assert.ok(row.label && row.value, 'every row needs a label and a figure');
    }
  });

  await t.test('the rendered specification is a real table with row headers', () => {
    const html = renderSpec(contentFor('spec', { subject: { subject: 'Cassini', domain: 'hardware' } }));
    assert.match(html, /<table class="spec">/);
    assert.match(html, /<caption>/);
    assert.match(html, /<th scope="row">/);
    // The coverage gate looks for a real table; a div grid does not satisfy it.
    assert.ok((html.match(/<tr>/g) ?? []).length >= 4);
  });

  await t.test('a brief that names the artefact still replaces the page', () => {
    const page = composePage({ request: 'Build me a login page for a bank.', taskType: 'create-page', projectKind: 'marketing-site' });
    assert.deepEqual(page.sections.map((s) => s.type), ['form']);
  });

  await t.test('describing a section is not asking for a page of only that section', () => {
    // "The hero should state what the machine does" matched the bare word
    // "hero" and pulled in a credibility logo row nobody had asked for.
    const page = composePage({ request: CASSINI, taskType: 'create-page', projectKind: 'marketing-site' });
    assert.ok(!page.sections.some((s) => s.type === 'proof'));
  });

  await t.test('an ordinary brief still gets the full recipe', () => {
    const page = composePage({ request: 'Build a landing page for a project management tool.', taskType: 'create-page', projectKind: 'marketing-site' });
    assert.ok(page.sections.length >= 8, 'nothing was enumerated, so the recipe stands');
  });
});

test('a refinement keeps the plan the first build decided', () => {
  const locked = ['nav', 'hero', 'process', 'spec', 'cta', 'footer'];
  const page = composePage({ request: 'Do it.', taskType: 'enhance', projectKind: 'marketing-site', lockedSections: locked });
  assert.deepEqual(page.sections.map((s) => s.type), locked);
  assert.match(page.notes.join(' '), /kept from the existing build/);
});

test('once a build exists, a judgement about it is a change request', async (t) => {
  const built = recordBuild(createAgreedContext(), {
    files: ['index.html'], summary: 'built', artDirection: 'archival-technical', sections: ['nav', 'hero', 'spec'],
  });
  const pending = (text) => extractContextHeuristically(built, text).changeRequests.length > 0;

  await t.test('a critique with no imperative verb still counts', () => {
    // These left nothing pending, so the next "Do it." was refused with "the
    // current build already reflects everything we agreed" — the agent heard
    // the criticism and then denied it had been made.
    assert.equal(pending('The specification table is the most interesting thing on the page but it reads like an afterthought.'), true);
    assert.equal(pending('The hero is too tall.'), true);
    assert.equal(pending('The quote gets lost down there.'), true);
  });

  await t.test('praise is not a change request', () => {
    assert.equal(pending('I love it.'), false);
    assert.equal(pending('That is exactly what I wanted.'), false);
  });

  await t.test('a question is not a change request', () => {
    assert.equal(pending('How does the reveal work?'), false);
  });

  await t.test('an imperative still counts', () => {
    assert.equal(pending('Make the spec table louder.'), true);
  });

  await t.test('nothing is pending before a build exists', () => {
    assert.equal(extractContextHeuristically(createAgreedContext(), 'The hero is too tall.').changeRequests.length, 0);
  });
});
