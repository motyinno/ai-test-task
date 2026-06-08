/**
 * DEPRECATED — M4: Migration consolidation.
 *
 * The Phase B SQL that was here has been merged into run-migrations.mjs,
 * which is now the single source of truth for all schema migrations.
 *
 * Use:
 *   node apps/api/src/shared/database/run-migrations.mjs
 *
 * That script runs Phase A then Phase B in order, idempotently.
 */
import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log(
  '[run-phase-b-migrations] This file is deprecated. ' +
  'Forwarding to run-migrations.mjs (Phase A + Phase B)...',
);

// Forward to the consolidated runner
const require = createRequire(import.meta.url);
const { execFileSync } = require('child_process');
execFileSync(
  process.execPath,
  [join(__dirname, 'run-migrations.mjs')],
  { stdio: 'inherit', env: process.env },
);
