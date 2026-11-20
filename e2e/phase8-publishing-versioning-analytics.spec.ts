import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';

interface Phase8ActorCredentials {
  readonly ownerEmail: string;
  readonly viewerEmail: string;
  readonly password: string;
  readonly runTag: string;
}

function getCredentialsForProject(projectName: string): Phase8ActorCredentials {
  const prefix = projectName === 'chromium-mobile' ? 'P8_E2E_MOBILE' : 'P8_E2E_DESKTOP';
  return {
    ownerEmail: process.env[`${prefix}_OWNER_EMAIL`] ?? '',
    viewerEmail: process.env[`${prefix}_VIEWER_EMAIL`] ?? '',
    password: process.env.P8_E2E_PASSWORD ?? '',
    runTag: process.env.P8_E2E_RUN_TAG ?? 'p8e2e',
  };
}

test.describe('Phase 8 Live Publishing History, Version Rollback, Analytics & Safe CSV Export E2E', () => {
  test.skip(
    process.env.P8_LIVE_E2E !== '1',
    'Live Phase 8 E2E runs via `npm run test:e2e:phase8:live` (`P8_LIVE_E2E=1`).',
  );

  test('proves immutable v1 -> v2 publish & rollback on live /w/:slug and /i/:token while preserving RSVPs, household vs. individual analytics, formula-safe CSV exports, and viewer RBAC', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(150_000);

    const isMobile = testInfo.project.name === 'chromium-mobile';
    const creds = getCredentialsForProject(testInfo.project.name);
    const shortTag = `${isMobile ? 'mob' : 'dsk'}-${creds.runTag}`;
    const workspaceName = `Versioning Studio ${shortTag}`;
    const slug = `aurelia-julian-${shortTag}`;
    const v1Headline = `Aurelia & Julian — Garden V1 (${shortTag})`;
    const v2Headline = `Aurelia & Julian — Midnight V2 (${shortTag})`;

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[organizer] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      pageErrors.push(`[organizer] ${err.message}`);
    });

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    guestPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[guest] ${msg.text()}`);
    });
    guestPage.on('pageerror', (err) => {
      pageErrors.push(`[guest] ${err.message}`);
    });

    try {
      // 1. Organizer signs in, creates Workspace, adds Viewer, creates Public Wedding
      await page.goto('/app/login');
      await page.getByLabel('Email address').fill(creds.ownerEmail);
      await page.getByLabel('Password', { exact: true }).fill(creds.password);
      await page.getByTestId('login-submit-button').click();

      await expect(page.getByTestId('workspace-onboarding-card')).toBeVisible({ timeout: 15_000 });
      await page.getByLabel('Workspace name').fill(workspaceName);
      await page.getByTestId('create-workspace-submit-button').click();
      await expect(page.getByTestId('active-workspace-heading')).toHaveText(workspaceName);

      await page.getByTestId('go-to-workspace-settings-link').click();
      await page.getByLabel('Organizer email').fill(creds.viewerEmail);
      await page.getByTestId('add-member-role-select').selectOption('viewer');
      await page.getByTestId('add-member-submit-button').click();
      await expect(page.getByTestId('add-member-success')).toContainText(creds.viewerEmail);

      await page.getByRole('link', { name: 'Overview', exact: true }).click();
      await page.getByTestId('open-create-wedding-wizard-button').click();
      await page.getByLabel('Partner 1 name').fill('Aurelia');
      await page.getByLabel('Partner 2 name').fill('Julian');
      await page.getByLabel(/Public URL slug/i).fill(slug);
      await page.getByLabel(/Celebration date/i).fill('2027-09-18');
      await page.getByLabel(/Venue name/i).fill('Villa Botanica');
      await page.getByTestId('wizard-next-step-button').click();
      await page.getByLabel('Wedding IANA timezone').selectOption('Asia/Manila');
      await page.getByLabel('Website access policy').selectOption('public');
      await page.getByTestId('create-wedding-submit-button').click();

      await expect(page.getByTestId('wedding-publishing-card')).toBeVisible({ timeout: 15_000 });
      const weddingOverviewUrl = page.url();

      // 2. Customize Hero headline for v1 in Builder and publish v1
      await page.getByTestId('summary-open-builder-link').click();
      await expect(page.getByTestId('wedding-invitation-builder')).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('select-section-hero').click();
      await page.getByTestId('hero-couple-headline-input').fill(v1Headline);
      await expect(page.getByTestId('builder-autosave-status')).toHaveAttribute(
        'data-autosave-state',
        'saved',
        { timeout: 10_000 },
      );

      await page.goto(weddingOverviewUrl);
      await expect(page.getByTestId('wedding-publishing-card')).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('publish-wedding-button').click();
      await expect(page.getByTestId('publishing-active-version-badge')).toContainText('v1', {
        timeout: 15_000,
      });
      await expect(page.getByTestId('version-active-badge-1')).toHaveText('Active Live');

      // 3. Configure Custom RSVP Question + Household (1 Adult + 1 Child) + Issue `/i/:token`
      await page.getByTestId('summary-open-rsvps-link').click();
      await expect(page.getByTestId('route-organizer-wedding-rsvps')).toBeVisible({
        timeout: 15_000,
      });

      await page.getByTestId('open-create-rsvp-question-button').click();
      await page.getByTestId('rsvp-question-label-input').fill('Main Course');
      await page.getByTestId('rsvp-question-type-select').selectOption('single_select');
      await page.getByTestId('rsvp-question-options-input').fill('Sea Bass, Truffle Risotto');
      await page.getByTestId('rsvp-question-required-checkbox').check();
      await page.getByTestId('save-rsvp-question-button').click();
      await expect(page.getByTestId('rsvp-questions-manager-card')).toContainText('Main Course');

      await page.getByTestId('rsvps-open-guests-link').click();
      await expect(page.getByTestId('route-organizer-wedding-guests')).toBeVisible({
        timeout: 15_000,
      });

      await page.getByTestId('open-create-household-button').click();
      await page.getByTestId('household-display-name-input').fill('The Santos Family');
      await page.getByTestId('household-max-attendees-input').fill('3');
      await page.getByTestId('save-household-button').click();

      const santosCard = page
        .locator('[data-testid^="household-card-"]')
        .filter({ hasText: 'The Santos Family' });
      await expect(santosCard).toBeVisible({ timeout: 10_000 });

      // Add Adult Guest
      await santosCard.locator('[data-testid^="add-guest-to-group-"]').click();
      await santosCard.getByTestId('guest-first-name-input').fill('Elena');
      await santosCard.getByTestId('guest-last-name-input').fill('Santos');
      await santosCard.getByTestId('save-guest-button').click();
      await expect(santosCard).toContainText('Elena Santos');

      // Add Child Guest (`is_child` checkbox)
      await santosCard.locator('[data-testid^="add-guest-to-group-"]').click();
      await santosCard.getByTestId('guest-first-name-input').fill('Leo');
      await santosCard.getByTestId('guest-last-name-input').fill('Santos');
      await santosCard.getByTestId('guest-is-child-checkbox').check();
      await santosCard.getByTestId('save-guest-button').click();
      await expect(santosCard).toContainText('Leo Santos');

      await santosCard.locator('[data-testid^="issue-invitation-"]').click();
      await expect(page.getByTestId('issued-invitation-qr-card')).toBeVisible({ timeout: 10_000 });
      const fullInvitationUrl = await page.getByTestId('issued-invitation-url-input').inputValue();
      const tokenPath = new URL(fullInvitationUrl).pathname;
      const rawToken = tokenPath.replace('/i/', '');

      // 4. Guest visits `/w/:slug` and `/i/:token` -> verifies v1 headline -> submits RSVP with formula-prefix dietary string `=1+1 Vegan`
      await guestPage.goto(`/w/${slug}`);
      await expect(guestPage.getByTestId('invitation-hero-headline')).toHaveText(v1Headline, {
        timeout: 15_000,
      });

      await guestPage.goto(tokenPath);
      await expect(guestPage.getByTestId('invitation-hero-headline')).toHaveText(v1Headline, {
        timeout: 15_000,
      });

      const elenaRow = guestPage
        .locator('[data-testid^="rsvp-member-row-"]')
        .filter({ hasText: 'Elena Santos' });
      await elenaRow.locator('[data-testid^="rsvp-guest-dietary-"]').fill('=1+1 Vegan');

      await guestPage
        .locator('[data-testid^="rsvp-question-input-"]')
        .nth(0)
        .selectOption('Truffle Risotto');
      await guestPage.getByTestId('rsvp-household-note-input').fill('+Excited for Tagaytay!');
      await guestPage.getByTestId('rsvp-submit-button').click();

      await expect(guestPage.getByTestId('public-rsvp-confirmed-summary')).toContainText(
        'Confirmed Attending (2 guests)',
        { timeout: 15_000 },
      );

      // 5. Organizer edits Hero headline to v2 in Builder and republishes v2
      await page.goto(`${weddingOverviewUrl}/builder`);
      await expect(page.getByTestId('wedding-invitation-builder')).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('select-section-hero').click();
      await page.getByTestId('hero-couple-headline-input').fill(v2Headline);
      await expect(page.getByTestId('builder-autosave-status')).toHaveAttribute(
        'data-autosave-state',
        'saved',
        { timeout: 10_000 },
      );

      await page.goto(weddingOverviewUrl);
      await page.getByTestId('publish-wedding-button').click();
      await expect(page.getByTestId('publishing-active-version-badge')).toContainText('v2', {
        timeout: 15_000,
      });
      await expect(page.getByTestId('version-active-badge-2')).toHaveText('Active Live');

      // Guest reloads `/w/:slug` -> sees v2 headline
      await guestPage.goto(`/w/${slug}`);
      await expect(guestPage.getByTestId('invitation-hero-headline')).toHaveText(v2Headline, {
        timeout: 15_000,
      });

      // 6. Organizer previews v1 in PublicationVersionHistoryCard and rolls back from v2 to v1!
      await page.getByTestId('preview-version-button-1').click();
      await expect(page.getByTestId('version-snapshot-preview-1')).toContainText(v1Headline);
      await page.getByTestId('preview-version-button-1').click();

      await page.getByTestId('open-rollback-version-1').click();
      await expect(page.getByTestId('rollback-confirm-panel-1')).toBeVisible();
      await page.getByTestId('confirm-rollback-version-1').click();

      await expect(page.getByTestId('publishing-active-version-badge')).toContainText('v1', {
        timeout: 15_000,
      });
      await expect(page.getByTestId('publishing-rolled-back-badge')).toContainText('Latest v2');
      await expect(page.getByTestId('version-active-badge-1')).toHaveText('Active Live');

      // 7. Guest reloads `/w/:slug` & `/i/:token` -> immediately sees rolled-back v1 while RSVP remains 100% intact!
      await guestPage.goto(`/w/${slug}`);
      await expect(guestPage.getByTestId('invitation-hero-headline')).toHaveText(v1Headline, {
        timeout: 15_000,
      });

      await guestPage.goto(tokenPath);
      await expect(guestPage.getByTestId('invitation-hero-headline')).toHaveText(v1Headline, {
        timeout: 15_000,
      });
      await expect(guestPage.getByTestId('public-rsvp-confirmed-summary')).toContainText(
        'Confirmed Attending (2 guests)',
      );
      expect(await guestPage.content()).not.toContain(rawToken);

      // 8. Organizer opens `/rsvps`, verifies Household vs. Individual Analytics (1 adult + 1 child, meal tally) & downloads formula-safe CSV!
      await page.getByTestId('summary-open-rsvps-link').click();
      await expect(page.getByTestId('wedding-rsvp-analytics-card')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId('analytics-household-response-rate')).toHaveText(
        '100% Responded',
      );
      await expect(page.getByTestId('analytics-confirmed-headcount')).toHaveText('2 / 3 Seats');
      await expect(page.getByTestId('analytics-attending-adults')).toHaveText('1');
      await expect(page.getByTestId('analytics-attending-children')).toHaveText('1');
      await expect(page.getByTestId('analytics-question-tallies')).toContainText('Truffle Risotto');

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('export-rsvp-attendance-csv-button').click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(`${slug}-rsvp-attendance.csv`);

      const downloadedPath = await download.path();
      expect(downloadedPath).toBeTruthy();
      const csvText = await fs.readFile(downloadedPath!, 'utf8');
      expect(csvText.startsWith('\uFEFF')).toBe(true);
      expect(csvText).toContain('Question: Main Course');
      expect(csvText).toContain('Truffle Risotto');
      expect(csvText).toContain("'=1+1 Vegan");
      expect(csvText).toContain("'+Excited for Tagaytay!");
      expect(csvText).not.toContain(rawToken);
      expect(csvText.toLowerCase()).not.toContain('token_hash');

      // 9. Viewer signs in -> verifies read-only Version History (preview allowed, rollback hidden)
      await page.getByTestId('organizer-signout-button').click();
      await expect(page.getByTestId('route-organizer-login')).toBeVisible({ timeout: 15_000 });

      await page.getByLabel('Email address').fill(creds.viewerEmail);
      await page.getByLabel('Password', { exact: true }).fill(creds.password);
      await page.getByTestId('login-submit-button').click();
      await expect(page.getByTestId('active-workspace-heading')).toHaveText(workspaceName, {
        timeout: 15_000,
      });

      await page.goto(weddingOverviewUrl);
      await expect(page.getByTestId('version-history-readonly-badge')).toContainText(
        'Read-only (Viewer)',
        { timeout: 15_000 },
      );
      await expect(page.getByTestId('open-rollback-version-2')).toHaveCount(0);
      await expect(page.getByTestId('preview-version-button-2')).toBeVisible();

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await guestContext.close();
    }
  });
});
