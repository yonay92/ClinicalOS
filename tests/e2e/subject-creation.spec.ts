/**
 * E2E tests: Subject list & creation flows.
 * Runs authenticated as the e2e admin persona (tests/e2e/.auth/admin.json,
 * provisioned by tests/e2e/global-setup.ts) — every route here sits behind
 * middleware auth, so an unauthenticated run never gets past a /login
 * redirect. See tests/e2e/README.md for the full fixture design.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scaffoldActiveStudy } from './helpers/apiScaffold';

const AUTH_DIR = join(__dirname, '.auth');

test.use({ storageState: join(AUTH_DIR, 'admin.json') });

const fixtures = JSON.parse(readFileSync(join(AUTH_DIR, 'fixtures.json'), 'utf-8')) as {
  siteName: string;
};

test.describe('Subjects list', () => {
  test('renders the subjects page with a New Subject action', async ({ page }) => {
    await page.goto('/subjects');
    await expect(page.getByRole('heading', { name: 'Subjects' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New Subject' })).toBeVisible();
  });
});

test.describe('Subject creation', () => {
  test('shows a validation error when required fields are missing', async ({ page }) => {
    await page.goto('/subjects/new');
    await expect(page.getByRole('heading', { name: 'New Subject' })).toBeVisible();
    await page.getByRole('button', { name: 'Create Subject' }).click();
    await expect(page.getByText('Study is required')).toBeVisible();
  });

  // Replaces a prior placeholder of the same intent ("blocks creation... no
  // approved visit template") that never actually triggered the block — it
  // only asserted the form's fields render. That business rule is already
  // covered directly at tests/unit/services/SubjectService.test.ts and
  // tests/integration/subject-creation.test.ts; it's also unreachable from
  // this form specifically, since /subjects/new only lists status=active
  // studies and a study cannot become active without an approved template
  // (StudyService.activateStudy) — so there's no way to reach "active study,
  // no approved template" through the UI to begin with. What the UI *can*
  // meaningfully cover, and previously had zero real coverage of, is the
  // golden path itself.
  test('creates a subject against a freshly activated study and redirects to its profile', async ({
    page,
  }) => {
    const runId = Date.now();
    const studyName = `E2E Subject-Creation Study ${runId}`;

    const sitesRes = await page.request.get('/api/sites');
    const sites = ((await sitesRes.json()) as { data: Array<{ id: string; name: string }> }).data;
    const site = sites.find((s) => s.name === fixtures.siteName);
    expect(site).toBeTruthy();

    await scaffoldActiveStudy(page.request, {
      studyName,
      siteId: site!.id,
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
      ],
    });

    await page.goto('/subjects/new');
    await expect(page.getByRole('heading', { name: 'New Subject' })).toBeVisible();

    await page.getByLabel('Study').selectOption({ label: studyName });

    // The seeded site auto-fills as read-only text when it's the caller's
    // only site; it only renders as a <select> once a second site exists —
    // handle both so this doesn't depend on how many sites have accumulated.
    const siteSelect = page.getByLabel('Site');
    if (await siteSelect.count()) {
      await siteSelect.selectOption({ label: fixtures.siteName });
    } else {
      await expect(page.getByText(fixtures.siteName)).toBeVisible();
    }

    await page.getByLabel('Subject number').fill(`E2E-SC-${runId}`);
    await page.getByRole('button', { name: 'Create Subject' }).click();

    await expect(page).toHaveURL(/\/subjects\/[0-9a-f-]{36}$/, { timeout: 10000 });
  });
});
