/** CLI argument parsing: `--flag value`, `--flag=value`, `--boolean`, `--no-x`. */
export function parseCliArgs(argv = []) {
  const args = { request: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i]);
    if (token.startsWith('--')) {
      const [key, inline] = token.slice(2).split('=');
      if (inline !== undefined) args.flags[key] = inline;
      else if (key.startsWith('no-')) args.flags[key] = true;
      else if (argv[i + 1] !== undefined && !String(argv[i + 1]).startsWith('--')) args.flags[key] = argv[++i];
      else args.flags[key] = true;
    } else {
      args.request.push(token);
    }
  }
  args.requestText = args.request.join(' ').trim();
  return args;
}

