import { request } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvLocal } from './helpers/env';
import { seedIdentityFixtures, E2E_USERS, E2E_PASSWORD, type E2EPersona } from './helpers/seed';
import { scaffoldActiveStudy } from './helpers/apiScaffold';

/**
 * Runs once before the e2e suite. Provisions the fixed company/roles/users
 * (idempotent — see helpers/seed.ts), then — as the freshly-provisioned admin
 * user — creates a fresh Site-assigned, approved-template, active Study (via
 * helpers/apiScaffold.ts, shared with subject-creation.spec.ts) so business
 * rules (GAP-REQ-03 approved-template gate, activateStudy's approved-template
 * requirement) are exercised exactly as the UI would trigger them. A brand
 * new study every run means tests/e2e/phi-contact-info.spec.ts always
 * creates its subject against a clean, subject-free study.
 *
 * Auth for all three personas is captured as Playwright storageState files
 * under tests/e2e/.auth/ (gitignored) via a real POST to /api/auth/signin —
 * the same endpoint and cookie-based Supabase session the login page uses —
 * so spec files' browser contexts (test.use({ storageState })) start already
 * signed in.
 */

const AUTH_DIR = join(__dirname, '.auth');

async function signInAndSaveState(
  baseURL: string,
  persona: E2EPersona,
  email: string,
  password: string,
): Promise<void> {
  const context = await request.newContext({ baseURL });
  const res = await context.post('/api/auth/signin', { data: { email, password } });
  if (!res.ok()) {
    throw new Error(
      `E2E global-setup: sign-in failed for ${persona} (${email}): ${res.status()} ${await res.text()}`,
    );
  }
  await context.storageState({ path: join(AUTH_DIR, `${persona}.json`) });
  await context.dispose();
}

export default async function globalSetup(): Promise<void> {
  loadEnvLocal();
  mkdirSync(AUTH_DIR, { recursive: true });

  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

  await seedIdentityFixtures();

  // Study scaffolding runs as the admin persona, via an authenticated request
  // context kept open across setup, then reused to persist that same session
  // as storageState so tests/e2e/study-creation.spec.ts and
  // tests/e2e/phi-contact-info.spec.ts (and any other spec) can reuse it via
  // test.use({ storageState: '.auth/admin.json' }) without signing in again.
  const adminContext = await request.newContext({ baseURL });
  const signInRes = await adminContext.post('/api/auth/signin', {
    data: { email: E2E_USERS.admin.email, password: E2E_PASSWORD },
  });
  if (!signInRes.ok()) {
    throw new Error(
      `E2E global-setup: admin sign-in failed: ${signInRes.status()} ${await signInRes.text()}`,
    );
  }

  const sitesRes = await adminContext.get('/api/sites');
  const sitesJson = (await sitesRes.json()) as { data: Array<{ id: string; name: string }> };
  const site = sitesJson.data.find((s) => s.name === 'E2E Test Site');
  if (!site) throw new Error('E2E global-setup: seeded site not visible to admin persona');

  // Unique per run — this suite never deletes the studies/visits/calendar
  // events it creates (a dedicated e2e project, safe to accumulate), so a
  // fixed visit title would collide with the same day's calendar cell from an
  // earlier run of the same day and break the spec's exact-text event lookup.
  const runId = Date.now();
  const studyName = `E2E PHI Study ${runId}`;
  const visit2Name = `Visit 2 (${runId})`;

  const { studyId } = await scaffoldActiveStudy(adminContext, {
    studyName,
    siteId: site.id,
    items: [
      {
        visit_name: 'Baseline',
        visit_order: 0,
        offset_days: 0,
        window_before: 0,
        window_after: 0,
        visit_type: 'scheduled',
        is_baseline: true,
        is_required: true,
      },
      {
        visit_name: visit2Name,
        visit_order: 1,
        offset_days: 0,
        window_before: 3,
        window_after: 3,
        visit_type: 'scheduled',
        is_baseline: false,
        is_required: true,
      },
    ],
  });

  await adminContext.storageState({ path: join(AUTH_DIR, 'admin.json') });
  await adminContext.dispose();

  await signInAndSaveState(baseURL, 'phi', E2E_USERS.phi.email, E2E_PASSWORD);
  await signInAndSaveState(baseURL, 'nophi', E2E_USERS.nophi.email, E2E_PASSWORD);

  writeFileSync(
    join(AUTH_DIR, 'fixtures.json'),
    JSON.stringify({ siteName: site.name, studyName, studyId, visit2Name }, null, 2),
  );
}
