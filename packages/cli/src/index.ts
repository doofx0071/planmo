import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT_SLUG } from '@planmo/shared';

/**
 * Minimal I/O seam so the smoke CLI is deterministic and unit-testable.
 * Real commands (init, status, ...) arrive with the Phase 03 CLI foundation;
 * the routing approach is recorded in ADR-0010.
 */
export interface CliIO {
  out: (line: string) => void;
  err: (line: string) => void;
}

const defaultIO: CliIO = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

const USAGE = [
  `Usage: ${PRODUCT_SLUG} <command>`,
  '',
  'Commands:',
  `  ${PRODUCT_SLUG} --version   print the PlanMo version`,
  `  ${PRODUCT_SLUG} --help      show this help`,
  '',
  'Real commands arrive with the Phase 03 CLI foundation.',
].join('\n');

function readVersion(): string {
  // dist/bin.js -> ../package.json (also correct when executed from src/).
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(resolve(here, '..', 'package.json'), 'utf8')) as {
    version?: string;
  };
  return pkg.version ?? '0.0.0';
}

export function run(argv: string[], io: CliIO = defaultIO): number {
  const [command] = argv;
  switch (command) {
    case '--version':
    case '-v':
      io.out(`${PRODUCT_SLUG} ${readVersion()}`);
      return 0;
    case '--help':
    case '-h':
      io.out(USAGE);
      return 0;
    case undefined:
      io.out(USAGE);
      return 0;
    default:
      io.err(`planmo: unknown command '${command}'`);
      io.err(`Run 'planmo --help' for usage.`);
      return 1;
  }
}
