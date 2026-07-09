/**
 * Atlas OS — Migration Runner
 *
 * Runs the mission_goals schema migration against the Neon database.
 * Uses Prisma db push (schema-driven, no manual SQL required).
 *
 * Run with: node scripts/run-migration.cjs
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('[Atlas] Running schema migration...\n');

try {
  execSync('npx prisma db push --accept-data-loss', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
  console.log('\n[Atlas] Schema migration complete.');
  console.log('[Atlas] Run "npx prisma generate" if Prisma Client needs updating.');
} catch (err) {
  console.error('[Atlas] Migration failed:', err.message);
  process.exit(1);
}
