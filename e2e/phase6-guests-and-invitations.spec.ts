import { expect, test } from '@playwright/test';

interface Phase6ActorCredentials {
  readonly ownerEmail: string;
  readonly viewerEmail: string;
  readonly password: string;
  readonly runTag: string;
}

function getCredentialsForProject(projectName: string): Phase6ActorCredentials {
  const prefix = projectName === 'chromium-mobile' ? 'P6_E2E_MOBILE' : 'P6_E2E_DESKTOP';
  return {
    ownerEmail: process.env[`${prefix}_OWNER_EMAIL`] ?? '',
    viewerEmail: process.env[`${prefix}_VIEWER_EMAIL`] ?? '',
    password: process.env.P6_E2E_PASSWORD ?? '',
    runTag: process.env.P6_E2E_RUN_TAG ?? 'p6e2e',
  };
}

test.describe('Phase 6 Live Guest Directory, CSV Import, QR & Hashed /i/:token E2E (Gate 5 Part 1)', () => {
  test.skip(
    process.env.P6_LIVE_E2E !== '1',
    'Live Phase 6 Guest & Invitation E2E runs via `npm run test:e2e:phase6:live` (`P6_LIVE_E2E=1`).',
  );

  test('proves CSV & manual household management, SHA-256 one-time token + QR issuance, unlocking invite_only published weddings via /i/:token, instant token rotation/revocation with zero token echo, and viewer read-only enforcement', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(120_000);

    const isMobile = testInfo.project.name === 'chromium-mobile';
    const creds = getCredentialsForProject(testInfo.project.name);
    const shortTag = `${isMobile ? 'mob' : 'dsk'}-${creds.runTag}`;
    const workspaceName = `Guests Studio ${shortTag}`;
    const slug = `noelle-julian-priv-${shortTag}`;
    const publicSlugPath = `/w/${slug}`;

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[organizer] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      pageErrors.push(`[organizer] ${err.message}`);
    });

    // Separate completely unauthenticated invited guest browser context (zero cookies / storage)
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    guestPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[guest] ${msg.text()}`);
    });
    guestPage.on('pageerror', (err) => {
      pageErrors.push(`[guest] ${err.message}`);
    });

    try {
      // 1. Organizer signs in, creates Workspace, adds Viewer, creates an `invite_only` Wedding
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
      await page.getByLabel('Partner 1 name').fill('Noelle');
      await page.getByLabel('Partner 2 name').fill('Julian');
      await page.getByLabel(/Public URL slug/i).fill(slug);
      await page.getByLabel(/Celebration date/i).fill('2027-09-18');
      await page.getByLabel(/Venue name/i).fill('Private Cliffside Villa');
      await page.getByTestId('wizard-next-step-button').click();
      await page.getByLabel('Wedding IANA timezone').selectOption('Asia/Manila');
      await page.getByLabel('Website access policy').selectOption('invite_only');
      await page.getByTestId('create-wedding-submit-button').click();

      await expect(page.getByTestId('wedding-publishing-card')).toBeVisible({ timeout: 15_000 });

      // 2. Navigate to Households & Invitations (`/app/weddings/:weddingId/guests`)
      await page.getByTestId('summary-open-guests-link').click();
      await expect(page.getByTestId('route-organizer-wedding-guests')).toBeVisible({
        timeout: 15_000,
      });
      const guestsAdminUrl = page.url();

      // 3. Bulk import sample CSV (2 households, 5 guests)
      await page.getByTestId('toggle-csv-import-button').click();
      await page.getByTestId('csv-load-sample-inline-button').click();
      await expect(page.getByTestId('csv-validation-ready')).toContainText(
        '2 households (5 guests)',
      );
      await page.getByTestId('csv-commit-import-button').click();

      await expect(page.getByTestId('metric-total-households')).toHaveText('2', {
        timeout: 15_000,
      });
      await expect(page.getByTestId('metric-total-guests')).toHaveText('5');

      // 4. Create a manual 3rd household + guest ("The Santos Household", cap 3)
      await page.getByTestId('open-create-household-button').click();
      await page.getByTestId('household-display-name-input').fill('The Santos Household');
      await page.getByTestId('household-max-attendees-input').fill('3');
      await page.getByTestId('household-notes-input').fill('Private VIP villa suite');
      await page.getByTestId('save-household-button').click();

      await expect(page.getByTestId('metric-total-households')).toHaveText('3', {
        timeout: 10_000,
      });

      const santosCard = page
        .locator('[data-testid^="household-card-"]')
        .filter({ hasText: 'The Santos Household' });
      await expect(santosCard).toBeVisible();

      await santosCard.locator('[data-testid^="add-guest-to-group-"]').click();
      await santosCard.getByTestId('guest-first-name-input').fill('Marco');
      await santosCard.getByTestId('guest-last-name-input').fill('Santos');
      await santosCard.getByTestId('guest-email-input').fill('marco.private@example.com');
      await santosCard.getByTestId('guest-dietary-input').fill('Nut-free');
      await santosCard.getByTestId('save-guest-button').click();
      await expect(santosCard).toContainText('Marco Santos');

      // 5. Issue 256-bit invitation link #1 & vector QR code BEFORE publishing -> verify unpublished `/i/:token` is unavailable
      await santosCard.locator('[data-testid^="issue-invitation-"]').click();
      await expect(page.getByTestId('issued-invitation-qr-card')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('issued-invitation-qr-svg').locator('svg')).toBeVisible();

      const fullUrl1 = await page.getByTestId('issued-invitation-url-input').inputValue();
      const parsedUrl1 = new URL(fullUrl1);
      const tokenPath1 = parsedUrl1.pathname;
      const rawToken1 = tokenPath1.replace('/i/', '');
      expect(rawToken1.length).toBeGreaterThanOrEqual(43);

      await guestPage.goto(tokenPath1);
      await expect(guestPage.getByTestId('public-invitation-unavailable')).toBeVisible({
        timeout: 15_000,
      });
      const unpubHtml = await guestPage.content();
      expect(unpubHtml).not.toContain(rawToken1);

      // 6. Organizer publishes `invite_only` wedding snapshot v1
      await page.getByTestId('guests-back-to-overview-link').click();
      await expect(page.getByTestId('wedding-publishing-card')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('publish-wedding-button').click();
      await expect(page.getByTestId('publishing-active-version-badge')).toContainText('v1', {
        timeout: 15_000,
      });

      // 7. Verify `/w/:slug` blocks unauthenticated public visitors (`Private Wedding Celebration`),
      //    while `/i/:token` UNLOCKS the personalized household greeting + `<InvitationRenderer />`!
      await guestPage.goto(publicSlugPath);
      await expect(guestPage.getByTestId('public-wedding-invite-only')).toBeVisible({
        timeout: 15_000,
      });
      await expect(guestPage.getByTestId('invitation-renderer')).toHaveCount(0);

      await guestPage.goto(tokenPath1);
      await expect(guestPage.getByTestId('public-invitation-household-card')).toBeVisible({
        timeout: 15_000,
      });
      await expect(guestPage.getByTestId('public-invitation-welcome-heading')).toHaveText(
        'Welcome, The Santos Household',
      );
      await expect(guestPage.getByTestId('public-invitation-capacity-badge')).toContainText(
        'Reserved for up to 3 guests',
      );
      await expect(guestPage.getByTestId('public-invitation-guest-list')).toContainText(
        'Marco Santos',
      );
      await expect(guestPage.getByTestId('invitation-renderer')).toBeVisible();

      // Verify zero leakage of raw token, organizer notes, or private email in DOM!
      const unlockedHtml = await guestPage.content();
      expect(unlockedHtml).not.toContain(rawToken1);
      expect(unlockedHtml).not.toContain('Private VIP villa suite');
      expect(unlockedHtml).not.toContain('marco.private@example.com');

      // 8. Organizer rotates link -> old link #1 is immediately revoked (`unavailable`), new link #2 works, then explicit Revoke invalidates #2!
      await page.getByTestId('summary-open-guests-link').click();
      await expect(page.getByTestId('route-organizer-wedding-guests')).toBeVisible({
        timeout: 15_000,
      });

      const santosCardAfter = page
        .locator('[data-testid^="household-card-"]')
        .filter({ hasText: 'The Santos Household' });
      await santosCardAfter.locator('[data-testid^="issue-invitation-"]').click();
      await expect(page.getByTestId('issued-invitation-qr-card')).toBeVisible({ timeout: 10_000 });

      const fullUrl2 = await page.getByTestId('issued-invitation-url-input').inputValue();
      const tokenPath2 = new URL(fullUrl2).pathname;
      const rawToken2 = tokenPath2.replace('/i/', '');
      expect(rawToken2).not.toBe(rawToken1);

      // Old rotated token #1 immediately returns unavailable with zero token echo
      await guestPage.goto(tokenPath1);
      await expect(guestPage.getByTestId('public-invitation-unavailable')).toBeVisible({
        timeout: 15_000,
      });
      expect(await guestPage.content()).not.toContain(rawToken1);

      // New rotated token #2 resolves active
      await guestPage.goto(tokenPath2);
      await expect(guestPage.getByTestId('public-invitation-welcome-heading')).toHaveText(
        'Welcome, The Santos Household',
        { timeout: 15_000 },
      );

      // Organizer revokes token #2 -> immediately returns unavailable
      await santosCardAfter.locator('[data-testid^="revoke-invitation-"]').click();
      await expect(santosCardAfter.locator('[data-testid^="inv-status-"]')).toHaveText(
        'No Active Link',
        { timeout: 10_000 },
      );

      await guestPage.goto(tokenPath2);
      await expect(guestPage.getByTestId('public-invitation-unavailable')).toBeVisible({
        timeout: 15_000,
      });
      expect(await guestPage.content()).not.toContain(rawToken2);

      // 9. Switch to Viewer account -> verify read-only banner & zero write controls on `/guests`
      await page.getByTestId('organizer-signout-button').click();
      await expect(page.getByTestId('route-organizer-login')).toBeVisible({ timeout: 15_000 });

      await page.getByLabel('Email address').fill(creds.viewerEmail);
      await page.getByLabel('Password', { exact: true }).fill(creds.password);
      await page.getByTestId('login-submit-button').click();
      await expect(page.getByTestId('active-workspace-heading')).toHaveText(workspaceName, {
        timeout: 15_000,
      });

      await page.goto(guestsAdminUrl);
      await expect(page.getByTestId('guests-viewer-readonly-banner')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId('open-create-household-button')).toHaveCount(0);
      await expect(page.getByTestId('toggle-csv-import-button')).toHaveCount(0);

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await guestContext.close();
    }
  });
});
