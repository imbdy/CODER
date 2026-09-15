export function printBanner() {
  console.log('\x1b[1m  artisan — autonomous frontend agent\x1b[0m');
  console.log('\x1b[2m  inspect → decide → build → verify → critique → fix\x1b[0m\n');
}
export function printHelp() {
  printBanner();
  console.log('Usage:');
  console.log('  artisan "Build me a premium login screen" --workspace ./demo --brain deterministic');
  console.log('  artisan --demo red-button|login|landing --workspace ./demo');
  console.log('  artisan doctor');
  console.log('  artisan skills');
  console.log('\nFlags: --workspace, --brain, --verbose, --dry-run, --json, --no-write, --max-iters');
}
