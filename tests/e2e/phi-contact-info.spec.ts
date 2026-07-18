/**
 * E2E tests: PHI Contact Info + Appointment Confirmation workflow.
 * Runs against the Next.js dev/prod server (baseURL from playwright.config.ts)
 * with a real Supabase backend — see tests/e2e/global-setup.ts, which
 * provisions three real, differently-permissioned users (admin, PHI-granted,
 * no-PHI) and a fresh active Study/Site/approved Visit Template before this
 * file runs, and tests/e2e/README.md for the full fixture design.
 *
 * Grouped as one test.describe.serial() block because the scenarios are
 * genuinely sequential — they share a single created subject and its Visit 2
 * calendar event, exercised first by the PHI user (add/edit contact info,
 * log appointment-confirmation attempts) and then by the no-PHI user
 * (confirming none of it leaked).
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AUTH_DIR = join(__dirname, '.auth');
const ADMIN_STATE = join(AUTH_DIR, 'admin.json');
const PHI_STATE = join(AUTH_DIR, 'phi.json');
const NOPHI_STATE = join(AUTH_DIR, 'nophi.json');

const fixtures = JSON.parse(readFileSync(join(AUTH_DIR, 'fixtures.json'), 'utf-8')) as {
  siteName: string;
  studyName: string;
  studyId: string;
  visit2Name: string;
};

const SUBJECT_NUMBER = 'E2E-001';
const CONTACT = {
  firstName: 'Jane',
  lastName: 'Doe',
  dob: '1980-05-15',
  sex: 'Female',
  phonePrimary: '555-123-4567',
  phoneSecondary: '555-999-0000',
  language: 'English',
};

let subjectId = '';

test.describe.serial('PHI Contact Info + Appointment Confirmation', () => {
  test.describe('Create subject (admin, no PHI grant)', () => {
    test.use({ storageState: ADMIN_STATE });

    test('creates a subject against the seeded active study', async ({ page }) => {
      await page.goto('/subjects/new');
      await expect(page.getByRole('heading', { name: 'New Subject' })).toBeVisible();

      await page.getByLabel('Study').selectOption({ label: fixtures.studyName });

      // The seeded site auto-fills as read-only text when it's the caller's
      // only site; it only renders as a <select> once a second site exists
      // (e.g. from an earlier manual run) — handle both so this doesn't
      // depend on how many prior e2e runs have accumulated sites.
      const siteSelect = page.getByLabel('Site');
      if (await siteSelect.count()) {
        await siteSelect.selectOption({ label: fixtures.siteName });
      } else {
        await expect(page.getByText(fixtures.siteName)).toBeVisible();
      }

      await page.getByLabel('Subject number').fill(SUBJECT_NUMBER);
      await page.getByRole('button', { name: 'Create Subject' }).click();

      await expect(page).toHaveURL(/\/subjects\/[0-9a-f-]{36}$/, { timeout: 10000 });
      subjectId = page.url().split('/subjects/')[1] ?? '';
      expect(subjectId).toMatch(/^[0-9a-f-]{36}$/);
    });

    test('does not see the Contact Info tab content by default (no view_subject_phi grant)', async ({
      page,
    }) => {
      // Runs before any contact info exists — this only proves the permission
      // gate itself (Restricted, not an edit form); the no-PHI persona's tests
      // below re-check this once there is real PHI on the subject to leak.
      await page.goto(`/subjects/${subjectId}`);
      await page.getByRole('button', { name: 'Contact Info' }).click();

      await expect(page.getByRole('heading', { name: 'Restricted' })).toBeVisible();
    });

    // Prerequisite scaffolding, not the feature under test — driven through the
    // real API (same endpoints VisitConfirmer/VisitStarter/SubjectBaselineCompleter
    // call) so Visit 2 ends up scheduled with a real target_date and therefore a
    // real calendar_events row (VisitService only creates one once a visit has a
    // target_date — see upsertCalendarEventForVisit).
    test('progresses the Baseline visit to Completed so Visit 2 is generated and calendared', async ({
      page,
    }) => {
      const visitsRes = await page.request.get(`/api/subjects/${subjectId}/visits`);
      expect(visitsRes.ok()).toBeTruthy();
      const visits = (
        (await visitsRes.json()) as { data: Array<{ id: string; visit_name: string }> }
      ).data;
      const baseline = visits.find((v) => v.visit_name === 'Baseline');
      expect(baseline).toBeTruthy();

      const confirmRes = await page.request.post(
        `/api/subjects/${subjectId}/visits/${baseline!.id}/confirm`,
      );
      expect(confirmRes.ok()).toBeTruthy();

      const startRes = await page.request.post(
        `/api/subjects/${subjectId}/visits/${baseline!.id}/start`,
      );
      expect(startRes.ok()).toBeTruthy();

      const today = new Date().toISOString().slice(0, 10);
      const baselineRes = await page.request.post(`/api/subjects/${subjectId}/baseline`, {
        data: { baseline_date: today },
      });
      expect(baselineRes.ok()).toBeTruthy();
    });
  });

  test.describe('PHI user: add/edit contact info, log appointment confirmations', () => {
    test.use({ storageState: PHI_STATE });

    test('adds contact information from the Subject profile', async ({ page }) => {
      await page.goto(`/subjects/${subjectId}`);
      await page.getByRole('button', { name: 'Contact Info' }).click();

      await expect(page.getByRole('heading', { name: 'Add Contact Information' })).toBeVisible();

      await page.getByLabel('First Name').fill(CONTACT.firstName);
      await page.getByLabel('Last Name').fill(CONTACT.lastName);
      await page.getByLabel('Date of Birth').fill(CONTACT.dob);
      await page.getByLabel('Sex').fill(CONTACT.sex);
      await page.getByLabel('Primary Phone').fill(CONTACT.phonePrimary);
      await page.getByLabel('Preferred Language').fill(CONTACT.language);
      await page.getByLabel('OK to leave voicemail').check();
      await page.getByRole('button', { name: 'Save' }).click();

      await expect(page.getByRole('heading', { name: 'Contact Information' })).toBeVisible();
      await expect(page.getByText(`${CONTACT.firstName} ${CONTACT.lastName}`)).toBeVisible();
      await expect(page.getByText(CONTACT.phonePrimary)).toBeVisible();
    });

    test('can view and edit the saved contact information', async ({ page }) => {
      await page.goto(`/subjects/${subjectId}`);
      await page.getByRole('button', { name: 'Contact Info' }).click();

      // View: previously saved data renders read-only with an Edit action.
      await expect(page.getByText(CONTACT.dob)).toBeVisible();
      await expect(page.getByText(CONTACT.language)).toBeVisible();

      // Edit: change the secondary phone and confirm it persists.
      await page.getByRole('button', { name: 'Edit' }).click();
      await page.getByLabel('Secondary Phone (optional)').fill(CONTACT.phoneSecondary);
      await page.getByRole('button', { name: 'Save' }).click();

      await expect(page.getByText(CONTACT.phoneSecondary)).toBeVisible();
    });

    test('logs appointment confirmation attempts from the Calendar and the status changes correctly', async ({
      page,
    }) => {
      await page.goto('/calendar');
      await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();

      const event = page.getByRole('button', { name: fixtures.visit2Name });
      await expect(event).toBeVisible({ timeout: 10000 });
      await event.click();

      // Scoped by accessible name (the visit detail modal's title), not just
      // role=dialog — logging a contact attempt opens a second, nested
      // "Log Contact Attempt" dialog on top of this one, and a bare
      // role=dialog locator would match both while it's open.
      const dialog = page.getByRole('dialog', { name: fixtures.visit2Name });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading', { name: 'Contact Information' })).toBeVisible();
      await expect(dialog.getByText(CONTACT.phonePrimary)).toBeVisible();

      // Starts not_contacted — displayed with underscores replaced by spaces.
      await expect(dialog.getByText('not contacted', { exact: true })).toBeVisible();
      await expect(dialog.locator('dt:has-text("Contact attempts") + dd')).toHaveText('0');

      // First attempt: Attempted, with a note.
      await dialog.getByRole('button', { name: 'Log Contact Attempt' }).click();
      await page.getByLabel('Outcome').selectOption({ label: 'Attempted' });
      await page.getByLabel('Notes (optional)').fill('Left a voicemail, will retry tomorrow');
      await page.getByRole('button', { name: 'Save' }).click();

      await expect(dialog.getByText('attempted', { exact: true })).toBeVisible();
      await expect(dialog.locator('dt:has-text("Contact attempts") + dd')).toHaveText('1');
      await expect(dialog.getByText('Left a voicemail, will retry tomorrow')).toBeVisible();

      // Second attempt: Confirmed — status transitions and the attempt count
      // increments again rather than resetting.
      await dialog.getByRole('button', { name: 'Log Contact Attempt' }).click();
      await page.getByLabel('Outcome').selectOption({ label: 'Confirmed' });
      await page.getByLabel('Notes (optional)').fill('Patient confirmed by phone');
      await page.getByRole('button', { name: 'Save' }).click();

      await expect(dialog.getByText('confirmed', { exact: true })).toBeVisible();
      await expect(dialog.locator('dt:has-text("Contact attempts") + dd')).toHaveText('2');
      await expect(dialog.getByText('Patient confirmed by phone')).toBeVisible();
    });
  });

  test.describe('No-PHI user: cannot see contact info or appointment confirmation', () => {
    test.use({ storageState: NOPHI_STATE });

    test('Contact Info tab is restricted and leaks no PHI', async ({ page }) => {
      await page.goto(`/subjects/${subjectId}`);
      await page.getByRole('button', { name: 'Contact Info' }).click();

      await expect(page.getByRole('heading', { name: 'Restricted' })).toBeVisible();
      await expect(page.getByText(CONTACT.firstName, { exact: false })).not.toBeVisible();
      await expect(page.getByText(CONTACT.phonePrimary)).not.toBeVisible();
    });

    test('Calendar visit detail panel renders with no Contact Information section', async ({
      page,
    }) => {
      await page.goto('/calendar');
      const event = page.getByRole('button', { name: fixtures.visit2Name });
      await expect(event).toBeVisible({ timeout: 10000 });
      await event.click();

      const dialog = page.getByRole('dialog', { name: fixtures.visit2Name });
      await expect(dialog).toBeVisible();
      // The rest of the visit detail still renders normally for this caller
      // (view_visits) — only the PHI-gated section is absent.
      await expect(dialog.getByText('Study', { exact: true })).toBeVisible();

      await expect(dialog.getByRole('heading', { name: 'Contact Information' })).not.toBeVisible();
      await expect(dialog.getByText(CONTACT.phonePrimary)).not.toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Log Contact Attempt' })).not.toBeVisible();
    });
  });
});
