/**
 * E2E tests: Recruitment & Patient Management (Sprint 5).
 * Runs against the Next.js dev/prod server (baseURL from playwright.config.ts)
 * with a real Supabase backend — see tests/e2e/global-setup.ts /
 * tests/e2e/README.md for the shared fixture design (admin/phi/nophi
 * personas, seeded company/site).
 *
 * Covers the golden path end to end through the real UI: create a Study with
 * a prescreening questionnaire, create a Lead in the company-wide pool, add
 * its PHI-gated contact info, submit a prescreening (verifying the automatic
 * eligibility scoring), and convert it into a real enrolled Subject. Also
 * verifies the no-PHI persona can navigate the pipeline but never sees
 * contact details — the same PHI-gating guarantee already proven for
 * Subjects in phi-contact-info.spec.ts, now extended to Leads.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scaffoldActiveStudy } from './helpers/apiScaffold';

const AUTH_DIR = join(__dirname, '.auth');
const ADMIN_STATE = join(AUTH_DIR, 'admin.json');
const NOPHI_STATE = join(AUTH_DIR, 'nophi.json');

const fixtures = JSON.parse(readFileSync(join(AUTH_DIR, 'fixtures.json'), 'utf-8')) as {
  siteName: string;
};

const runId = Date.now();
const STUDY_NAME = `E2E Recruitment Study ${runId}`;
const ELIGIBILITY_QUESTION = `Is the patient 18 or older? (${runId})`;
const SUBJECT_NUMBER = `E2E-REC-${runId}`;

let studyId = '';
let leadId = '';

test.describe.serial('Recruitment & Patient Management', () => {
  test.describe('Admin: configure study, run the full lead lifecycle', () => {
    test.use({ storageState: ADMIN_STATE });

    // Prerequisite scaffolding (Study/Site/Visit-Template/activation), not
    // the feature under test — study-creation.spec.ts already covers this
    // flow through the real UI; here it's driven through the same real API
    // that flow ends up calling.
    test('scaffolds an active study with a Baseline visit template', async ({ page }) => {
      const sitesRes = await page.request.get('/api/sites');
      const sites = ((await sitesRes.json()) as { data: Array<{ id: string; name: string }> }).data;
      const site = sites.find((s) => s.name === fixtures.siteName);
      expect(site).toBeTruthy();

      const { studyId: id } = await scaffoldActiveStudy(page.request, {
        studyName: STUDY_NAME,
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
      studyId = id;
      expect(studyId).toMatch(/^[0-9a-f-]{36}$/);
    });

    test('configures a prescreening question for the study via the UI', async ({ page }) => {
      await page.goto(`/studies/${studyId}`);
      await page.getByRole('button', { name: 'Prescreening' }).click();
      await page.getByRole('link', { name: 'Manage Prescreening Questions' }).click();

      await expect(page).toHaveURL(new RegExp(`/studies/${studyId}/prescreening-questions$`));
      await page.getByLabel('Question text').fill(ELIGIBILITY_QUESTION);
      // Answer type defaults to Yes / No; eligible answer defaults to Yes.
      await page.getByLabel('Hard exclusion', { exact: false }).check();
      await page.getByRole('button', { name: 'Add Question' }).click();

      await expect(page.getByText(ELIGIBILITY_QUESTION)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Hard exclusion', { exact: true })).toBeVisible();
    });

    test('creates a lead in the pool, matched to the study and site', async ({ page }) => {
      await page.goto('/recruitment/new');
      await page.getByLabel('Study (optional)').selectOption({ label: STUDY_NAME });

      const siteSelect = page.getByLabel('Site (optional)');
      if (await siteSelect.count()) {
        await siteSelect.selectOption({ label: fixtures.siteName });
      }

      await page.getByRole('button', { name: 'Create Lead' }).click();
      await expect(page).toHaveURL(/\/recruitment\/[0-9a-f-]{36}$/, { timeout: 10000 });
      leadId = page.url().split('/recruitment/')[1] ?? '';
      expect(leadId).toMatch(/^[0-9a-f-]{36}$/);
    });

    test('adds contact information — Administrator has lead PHI by default', async ({ page }) => {
      await page.goto(`/recruitment/${leadId}`);
      await expect(page.getByRole('heading', { name: 'Add Contact Information' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Restricted' })).not.toBeVisible();

      await page.getByLabel('First Name').fill('Jordan');
      await page.getByLabel('Last Name').fill('Rivera');
      // Both required before conversion — subject_contact_info needs them
      // NOT NULL even though they're optional at the recruitment stage.
      await page.getByLabel('Date of Birth (optional)').fill('1985-06-15');
      await page.getByLabel('Sex (optional)').fill('Female');
      await page.getByLabel('Primary Phone').fill('555-222-3333');
      await page.getByRole('button', { name: 'Save' }).click();

      // exact: true — "Add Contact Information" (the form heading, still
      // mounted for a moment during the transition) contains this string too.
      await expect(
        page.getByRole('heading', { name: 'Contact Information', exact: true }),
      ).toBeVisible();
      await expect(page.getByText('Jordan Rivera')).toBeVisible();
    });

    test('submits a prescreening and the outcome is scored automatically', async ({ page }) => {
      await page.goto(`/recruitment/${leadId}`);
      await page.getByRole('button', { name: 'New Prescreening' }).click();
      await page.getByLabel('Study').selectOption({ label: STUDY_NAME });

      await expect(page.getByText(ELIGIBILITY_QUESTION)).toBeVisible();
      await page.getByLabel(ELIGIBILITY_QUESTION).selectOption('yes');
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByText('Potentially Eligible')).toBeVisible({ timeout: 10000 });
    });

    test('converts the lead into a real, enrolled Subject', async ({ page }) => {
      await page.goto(`/recruitment/${leadId}`);
      await page.getByRole('button', { name: 'Convert to Subject' }).click();
      await page.getByLabel('Subject number').fill(SUBJECT_NUMBER);
      // Scoped to exact "Convert" — the trigger button ("Convert to Subject")
      // stays mounted behind the modal, so an unscoped/substring match would
      // hit both.
      await page.getByRole('button', { name: 'Convert', exact: true }).click();

      await expect(page.getByText('Converted to Subject.')).toBeVisible({ timeout: 10000 });
      const subjectLink = page.getByRole('link', { name: 'View Subject profile' });
      await expect(subjectLink).toBeVisible();

      // Following through confirms the copied contact info really landed in
      // subject_contact_info, not just that the lead row flipped to converted.
      await subjectLink.click();
      await expect(page).toHaveURL(/\/subjects\/[0-9a-f-]{36}$/);
      await page.getByRole('button', { name: 'Contact Info' }).click();
      await expect(page.getByText('Jordan Rivera')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('No-PHI user: can navigate the pipeline but never sees contact details', () => {
    test.use({ storageState: NOPHI_STATE });

    test('sees the lead in the pipeline list without any contact info', async ({ page }) => {
      await page.goto('/recruitment');
      await expect(page.getByRole('heading', { name: 'Recruitment' })).toBeVisible();
      // The pipeline list itself never renders raw contact fields — only
      // initials, study/site, status, and attempt count — so no PHI value
      // should ever appear here, only the auto-generated initials.
      await expect(page.getByText('Jordan Rivera')).not.toBeVisible();
    });

    test('Contact Info is restricted on the lead detail page', async ({ page }) => {
      await page.goto(`/recruitment/${leadId}`);
      await expect(page.getByRole('heading', { name: 'Restricted' })).toBeVisible();
      await expect(page.getByText('Jordan Rivera')).not.toBeVisible();
      await expect(page.getByText('555-222-3333')).not.toBeVisible();
    });
  });
});
