/**
 * Discussion vs execution — deterministic message classification.
 *
 * The runtime, not the prompt, decides whether a turn may modify files:
 *   - explicit execution commands ("build it", "go ahead", "implement it") → candidate
 *   - a model-declared build intent is only honoured when the message actually
 *     carries an execution verb ("okay, implement the hero change")
 *   - "what if", "maybe", "don't build yet" always stay in discussion
 * Sufficient agreed context is checked separately (agreed-context.mjs).
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

/**
 * Decide whether this turn is an instruction to execute.
 * @param {object} input
 * @param {string} input.text            the user's message
 * @param {string} [input.modelIntent]   'discuss' | 'build' | 'question' | 'meta' from the conversation model
 * @returns {{execute: boolean, why: string, detailed: boolean}}
 */
export function decideExecution({ text, modelIntent } = {}) {
  const t = normalizeMessage(text);
  if (!t) return { execute: false, why: 'empty', detailed: false };
  if (isDiscussFirst(t)) return { execute: false, why: 'discuss-first signal', detailed: false };
  if (isExplicitTrigger(t)) return { execute: true, why: 'explicit trigger', detailed: false };
  const verb = hasExecutionVerb(t);
  if (modelIntent === 'build' && verb) return { execute: true, why: 'model intent + execution verb', detailed: t.length > 40 };
  if (modelIntent === 'build' && !verb) return { execute: false, why: 'model said build but the message carries no execution verb', detailed: false };
  // No model (offline): a detailed imperative request is its own context ("Build a landing page for X").
  if (modelIntent === undefined && verb && t.length > 24 && /^(please\s+)?(build|create|make|implement|code|write|scaffold|generate|develop)\b/i.test(t) && !QUESTION_RE.test(t)) return { execute: true, why: 'detailed imperative request', detailed: true };
  return { execute: false, why: 'discussion', detailed: false };
}
