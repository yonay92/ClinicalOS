import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Playwright's process is launched directly (`playwright test`), not through
// `next dev`/`next build`, so unlike the app itself it never gets .env.local
// loaded automatically. This is a minimal, dependency-free parser — just
// enough to populate process.env for the Supabase admin client and the app's
// own env-var reads (createAdminSupabaseClient, resolveAuthContext, etc.)
// used by tests/e2e/helpers/seed.ts and global-setup.ts.
export function loadEnvLocal(): void {
  const path = join(__dirname, '..', '..', '..', '.env.local');
  let contents: string;
  try {
    contents = readFileSync(path, 'utf-8');
  } catch {
    return;
  }

  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}
