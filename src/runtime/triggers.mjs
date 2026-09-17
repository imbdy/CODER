/**
 * Discussion vs execution — deterministic message classification.
 *
 * The runtime, not the prompt, decides whether a turn may modify files.
 *
 *   - A BRIEF is an instruction. "I want to build a landing page for my AI dev
 *     tool — premium, cinematic, typography-led, not the usual AI SaaS look"
 *     already says what to do and how; demanding a separate "build it" is
 *     bureaucracy, so the runtime executes it straight away.
 *   - An explicit command ("build it", "go ahead", "do it") always executes.
 *   - Ideas, questions, opinions and "what if / maybe / let's discuss first"
 *     never execute.
 *   - Once a build exists, a new brief is treated as a change request and waits
 *     for a word, so a passing thought can never overwrite the live design.
 *
 * Whether enough has been AGREED to execute is a separate question, answered by
 * agreed-context.mjs.
 */

const EXPLICIT_TRIGGERS = [
  /^(ok(ay)?|alright|right|cool|yes|yeah|yep|sure|great|perfect|awesome|fine)?[,.! ]*(please[,. ]*)?(now[,. ]*)?(go( ahead)?( and)?[,. ]*)?(build|implement|make|do|ship|code|write|create|start( working| building| coding)?|finish|execute|proceed|run with|apply)( it| this| that| now| please| everything| the (change|changes|update|updates|plan|design|site|page|hero|thing))?( now| please)?[.! ]*$/i,
  /^(ok(ay)?|alright|yes|yeah|sure|cool)?[,.! ]*let'?s (build|do it|go|ship it|make it|start|implement it|code it|write it)( then)?[.! ]*$/i,
  /^(ok(ay)?|alright)?[,.! ]*go build it[.! ]*$/i,
  /^(ok(ay)?|alright|yes|yeah|sure|cool)?[,.! ]*(go|go ahead|go for it|go on|start|proceed|execute|ship it|do it|make it so|build)( then| now| please)?[.! ]*$/i,
  /^(ok(ay)?|alright)?[,.! ]*(that'?s it|that works|sounds good|looks good|good)[,.! ]*(go|build it|do it|implement it|ship it|go ahead|proceed|make it|let'?s build)[.! ]*$/i,
];

const EXEC_VERB_RE = /\b(build|implement|code it|write it|ship|start (working|building|coding)|finish|proceed|go ahead|do it|execute|apply|generate|scaffold|develop|put (it )?together|get (it )?(built|done)|let'?s (build|do|go|ship)|create)\b/i;
const DISCUSS_FIRST_RE = /\b(don'?t build|do not build|not yet|no code yet|before (you|we) build|let'?s (discuss|talk|think)|discuss (this |it )?first|first[, ]+(let'?s )?(discuss|talk)|what do you think|help me decide|just (an idea|thinking|brainstorm)|what if|maybe we|could we|should we|would it|i'?m thinking|i was thinking|thinking (about|of)|how about|any thoughts|thoughts\?|not sure (if|whether)|is it (a good idea|possible|worth))\b/i;
const QUESTION_RE = /^(what|why|how|which|where|when|who|is|are|can|could|would|should|do|does|did|will|explain|tell me|describe)\b|\?\s*$/i;

const META = [
  { kind: 'greeting', re: /^(hi|hiya|hello|hey|yo|hola|salam|marhaba|good\s?(morning|afternoon|evening)|sup|what'?s up)\b[!., ]*(there|artisan|agent)?[!. ]*$/i },
  { kind: 'thanks', re: /^(thanks|thank you|thx|cheers|shukran|ty)\b/i },
  { kind: 'status', re: /^(\/?status|progress|where are we|what'?s the status|what have you (done|built|changed)|what did you (do|build|change)|show (me )?(the )?(status|progress|todos?))\b/i },
  { kind: 'workspace', re: /\b(which|what) (folder|directory|workspace|path)\b|\bwhere (are|r) (you|u) (working|building|writing)\b|\bwhere (do|will) the files go\b/i },
  { kind: 'identity', re: /^(who are you|what are you|what is artisan|what model are you|are you an ai)\b/i },
  { kind: 'capabilities', re: /^(what can you (do|build|make)|what do you do|how does this work|how do (i|we) (use|start)|what are you (capable|able)|help|commands)\b/i },
];

export function normalizeMessage(text) { return String(text ?? '').replace(/\s+/g, ' ').trim(); }

export function isExplicitTrigger(text) {
  const t = normalizeMessage(text);
  if (!t || t.length > 90) return false;
  if (DISCUSS_FIRST_RE.test(t)) return false;
  if (EXPLICIT_TRIGGERS.some((re) => re.test(t))) return true;
  const last = t.split(/(?<=[.!?])\s+/).filter(Boolean).at(-1) ?? '';
  return last !== t && last.length < 60 && EXPLICIT_TRIGGERS.some((re) => re.test(last));
}

export function hasExecutionVerb(text) { return EXEC_VERB_RE.test(normalizeMessage(text)); }
export function isDiscussFirst(text) { return DISCUSS_FIRST_RE.test(normalizeMessage(text)); }
export function isQuestion(text) { const t = normalizeMessage(text); return QUESTION_RE.test(t) && !isExplicitTrigger(t); }

/** Session-meta messages (about the session, not the design). */
export function matchMeta(text) {
  const t = normalizeMessage(text);
  if (!t || t.startsWith('/')) return null;
  if (isExplicitTrigger(t) || (hasExecutionVerb(t) && t.length > 20)) return null;
  for (const { kind, re } of META) if (re.test(t)) return kind;
  return null;
}

/* ---------------------------------------------------------------- briefs ---- */

/** "I want / I need / build me / can you build" — a request for something to exist. */
const WANT_RE = /\b(i want|i need|i'?d like|i would like|we want|we need|we'?re building|i'?m building|i'?m looking for|looking to (build|create|make)|help me (build|create|make|design)|build me|make me|design me|create me|give me|let'?s (build|create|make)|please (build|create|make|design))\b/i;
/** An imperative, plain or polite: "Build X", "Could you design X". */
const IMPERATIVE_RE = /^(please\s+)?(build|create|make|design|implement|scaffold|generate|develop|code|write)\b/i;
const POLITE_IMPERATIVE_RE = /\b(can|could|would) you (please )?(build|create|make|design|implement|generate|develop|put together)\b/i;
const OBJECT_RE = /\b(landing page|home ?page|marketing site|web ?site|site|web app|app|dashboard|portfolio|blog|docs? site|component library|design system|login (?:page|screen)|sign-?up (?:page|flow)|checkout|pricing page|hero(?: section)?|section|component|form|page|screen|ui|interface)\b/i;

/**
 * Signals that a brief carries a DIRECTION and not just a noun.
 * Prefixes are deliberate: /typograph/ must match "typography" and "typographic",
 * so these patterns do not close with \b.
 */
const DIRECTION_SIGNALS = [
  /\b(premium|cinematic|immersive|editorial|minimal|brutalist|luxury|playful|elegant|bold|calm|quiet|warm|dark|light|moody|dramatic|futuristic|technical|clean|refined|severe)\b/i,
  /\b(typograph|font|serif|sans-serif|type-led|display type|wordmark)/i,
  /\b(colou?r|palette|accent|gradient|monochrome|hue)/i,
  /\b(motion|animat|scroll|parallax|transition|micro-?interaction|kinetic)/i,
  /\b(3d|webgl|three\.?js|depth|spatial|layered|dimensional)/i,
  /\b(layout|grid|composition|asymmetr|split|hero|above the fold)/i,
  /\b(story|storytelling|narrative|mood|atmosphere|feel|feeling|vibe|aesthetic|identity|brand)/i,
  /\b(not|no|avoid|don'?t want|without|instead of)\b/i,
  /\b(for (developers|designers|teams|founders|engineers|students|creators|marketers|customers)|audience|target)/i,
  /\b(responsive|mobile|accessib|performan|fast|60fps)/i,
];

export function directionSignalCount(text) {
  const t = normalizeMessage(text);
  return DIRECTION_SIGNALS.reduce((count, re) => count + (re.test(t) ? 1 : 0), 0);
}

/**
 * Is this message a brief the runtime should execute without waiting for a
 * separate "build it"?
 * @returns {{brief: boolean, why: string, signals: number}}
 */
/** Comparative / incremental phrasing: a change to something that already exists. */
const MODIFICATION_RE = /\b(more|less|bigger|smaller|larger|tighter|looser|darker|lighter|stronger|softer|bolder|quieter|calmer|faster|slower|instead|again|also|rework|redo|tweak|adjust|refine|polish)\b/i;

export function isBuildBrief(text) {
  const t = normalizeMessage(text);
  if (!t) return { brief: false, why: 'empty', signals: 0 };
  if (isDiscussFirst(t)) return { brief: false, why: 'discuss-first signal', signals: 0 };
  // "Make the hero more immersive" is a change request, not an opening brief.
  if (MODIFICATION_RE.test(t) && t.length < 90) return { brief: false, why: 'reads as a change to existing work', signals: 0 };
  const asks = WANT_RE.test(t) || IMPERATIVE_RE.test(t) || POLITE_IMPERATIVE_RE.test(t);
  // A question that is not also a request ("How would you build X?") stays talk.
  if (!asks && QUESTION_RE.test(t)) return { brief: false, why: 'question', signals: 0 };
  if (!asks) return { brief: false, why: 'no request to build anything', signals: 0 };
  if (/\bhow would you\b|\bwhat would you\b/i.test(t)) return { brief: false, why: 'asking for an opinion', signals: 0 };
  if (!OBJECT_RE.test(t)) return { brief: false, why: 'names nothing buildable', signals: 0 };
  const signals = directionSignalCount(t);
  if (signals >= 2) return { brief: true, why: `${signals} direction signals`, signals };
  const imperative = IMPERATIVE_RE.test(t) || POLITE_IMPERATIVE_RE.test(t);
  if (imperative && signals >= 1) return { brief: true, why: `explicit request + ${signals} direction signal`, signals };
  if (imperative && t.length > 40) return { brief: true, why: 'explicit request with substance', signals };
  return { brief: false, why: `only ${signals} direction signal(s) — needs a direction`, signals };
}

/**
 * Decide whether this turn is an instruction to execute.
 * @param {{text: string, modelIntent?: 'discuss'|'build'|'question'|'meta', hasBuild?: boolean}} input
 * @returns {{execute: boolean, why: string, detailed: boolean}}
 */
export function decideExecution({ text, modelIntent, hasBuild = false } = {}) {
  const t = normalizeMessage(text);
  if (!t) return { execute: false, why: 'empty', detailed: false };
  if (isDiscussFirst(t)) return { execute: false, why: 'discuss-first signal', detailed: false };
  if (isExplicitTrigger(t)) return { execute: true, why: 'explicit trigger', detailed: false };
  // A full brief is an instruction — do not make the user ask twice. After a
  // build exists a brief is a change request, and that waits for a word so a
  // passing idea never silently overwrites the live design.
  if (!hasBuild) {
    const brief = isBuildBrief(t);
    if (brief.brief) return { execute: true, why: `brief: ${brief.why}`, detailed: true };
  }
  const verb = hasExecutionVerb(t);
  if (modelIntent === 'build' && verb) return { execute: true, why: 'model intent + execution verb', detailed: t.length > 40 };
  if (modelIntent === 'build' && !verb) return { execute: false, why: 'model said build but the message carries no execution verb', detailed: false };
  return { execute: false, why: 'discussion', detailed: false };
}
