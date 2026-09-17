/** Fix conversation.mjs double-escape corruption. */
import fs from 'node:fs';
const path = 'src/runtime/conversation.mjs';
let s = fs.readFileSync(path, 'utf8');

// Count what we'll fix
const before = { n4: (s.match(/\\\\\\\\/g) || []).length, n2n: (s.match(/\\\\n/g) || []).length, nJoin: (s.match(/\\\\n\\\\n/g) || []).length };

// Fix: the editor doubled every backslash in inserted text.
//   \\\\  -> \\      (4 backslashes -> 2)
//   \\\\n -> \\n      (4 backslashes before n -> 2 before n)
//   \\\\\" -> \\"     etc.
s = s.replace(/\\\\\\\\/g, '\\\\');
s = s.replace(/\\\\n/g, '\\n');
s = s.replace(/\\\\"/g, '\\"');
s = s.replace(/\\\\'/g, "\\'");

fs.writeFileSync(path, s);
console.log('fixed. before: n4=%d, n2n=%d, nJoin=%d', before.n4, before.n2n, before.nJoin);
console.log('after n4:', (s.match(/\\\\\\\\/g) || []).length);
console.log('sample line 52:', JSON.stringify(s.split('\n')[51]));
