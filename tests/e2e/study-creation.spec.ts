/**
 * E2E tests: Study creation & visit template flows.
 * Runs authenticated as the e2e admin persona (tests/e2e/.auth/admin.json,
 * provisioned by tests/e2e/global-setup.ts) — every route here sits behind
 * middleware auth, so an unauthenticated run never gets past a /login
 * redirect. See tests/e2e/README.md for the full fixture design.
 */
import { test, expect } from '@playwright/test';
import { join } from 'node:path';

test.use({ storageState: join(__dirname, '.auth', 'admin.json') });

test.describe('Studies list', () => {
  test('renders the studies page with a New Study action', async ({ page }) => {
    await page.goto('/studies');
    await expect(page.getByRole('heading', { name: 'Studies' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New Study' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Upload Protocol' })).toBeVisible();
  });
});

test.describe('Manual study creation', () => {
  test('creates a study and redirects to its profile page', async ({ page }) => {
    await page.goto('/studies/new');
    await expect(page.getByRole('heading', { name: 'New Study' })).toBeVisible();

    const studyName = `E2E Study ${Date.now()}`;
    await page.getByLabel('Study name').fill(studyName);
    await page.getByRole('button', { name: 'Create Study' }).click();

    await expect(page).toHaveURL(/\/studies\/[0-9a-f-]+$/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: studyName })).toBeVisible();
  });

  test('shows a validation error when study name is missing', async ({ page }) => {
    await page.goto('/studies/new');
    await page.getByRole('button', { name: 'Create Study' }).click();
    await expect(page.getByText('Study name is required')).toBeVisible();
  });
});

test.describe('Visit template builder', () => {
  test('adds visits, marks one Baseline, and saves a draft version', async ({ page }) => {
    await page.goto('/studies/new');
    const studyName = `E2E Template Study ${Date.now()}`;
    await page.getByLabel('Study name').fill(studyName);
    await page.getByRole('button', { name: 'Create Study' }).click();
    await expect(page).toHaveURL(/\/studies\/[0-9a-f-]+$/, { timeout: 10000 });

    await page.getByRole('link', { name: 'Manage Visit Templates' }).click();
    await expect(page.getByRole('heading', { name: 'Visit Templates' })).toBeVisible();

    await page.getByPlaceholder('Visit name (e.g. Screening)').first().fill('Screening');
    await page.getByRole('button', { name: 'Add Visit' }).click();
    await page.getByPlaceholder('Visit name (e.g. Screening)').nth(1).fill('Baseline');
    // VisitTemplateBuilder.handleSave rejects the draft unless exactly one
    // item is marked Baseline — the second row here is it.
    await page.getByRole('radio', { name: 'Baseline' }).nth(1).check();

    await page.getByRole('button', { name: 'Save as Draft' }).click();
    await expect(page.getByText('Version 1 (manual)')).toBeVisible({ timeout: 10000 });

    // Scoped to the saved template's read-only item list — the builder form
    // below it resets to one empty row (with its own "Baseline" radio label)
    // ready for a v2, so an unscoped getByText('Baseline') would be ambiguous.
    const savedItems = page.getByRole('list');
    await expect(savedItems.getByText('Screening')).toBeVisible();
    await expect(savedItems.getByText('Baseline')).toBeVisible();
  });

  test('approving a second draft version supersedes (archives) the previously approved one', async ({
    page,
  }) => {
    // Replaces a prior placeholder of the same name that asserted "blocking" —
    // VisitTemplateService.approveTemplate does not block a second approval,
    // it auto-archives whichever version was previously approved for the
    // study. This exercises the real rule: exactly one approved version at a
    // time, enforced by supersession rather than rejection.
    await page.goto('/studies/new');
    const studyName = `E2E Supersede Study ${Date.now()}`;
    await page.getByLabel('Study name').fill(studyName);
    await page.getByRole('button', { name: 'Create Study' }).click();
    await expect(page).toHaveURL(/\/studies\/[0-9a-f-]+$/, { timeout: 10000 });

    await page.getByRole('link', { name: 'Manage Visit Templates' }).click();
    await expect(page.getByRole('heading', { name: 'Visit Templates' })).toBeVisible();

    await page.getByPlaceholder('Visit name (e.g. Screening)').first().fill('Baseline');
    await page.getByRole('radio', { name: 'Baseline' }).first().check();
    await page.getByRole('button', { name: 'Save as Draft' }).click();
    await expect(page.getByText('Version 1 (manual)')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(
      page.getByText('Version 1 (manual)').locator('..').getByText('approved', { exact: true }),
    ).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder('Visit name (e.g. Screening)').first().fill('Baseline');
    await page.getByRole('radio', { name: 'Baseline' }).first().check();
    await page.getByRole('button', { name: 'Save as Draft' }).click();
    await expect(page.getByText('Version 2 (manual)')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Approve' }).click();

    await expect(
      page.getByText('Version 2 (manual)').locator('..').getByText('approved', { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText('Version 1 (manual)').locator('..').getByText('archived', { exact: true }),
    ).toBeVisible();
  });
});
