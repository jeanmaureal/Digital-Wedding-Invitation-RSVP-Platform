import { expect, test } from '@playwright/test';

interface Phase7ActorCredentials {
  readonly ownerEmail: string;
  readonly viewerEmail: string;
  readonly password: string;
  readonly runTag: string;
}

function getCredentialsForProject(projectName: string): Phase7ActorCredentials {
  const prefix = projectName === 'chromium-mobile' ? 'P7_E2E_MOBILE' : 'P7_E2E_DESKTOP';
  return {
    ownerEmail: process.env[`${prefix}_OWNER_EMAIL`] ?? '',
    viewerEmail: process.env[`${prefix}_VIEWER_EMAIL`] ?? '',
    password: process.env.P7_E2E_PASSWORD ?? '',
    runTag: process.env.P7_E2E_RUN_TAG ?? 'p7e2e',
  };
}

test.describe('Phase 7 Live Transactional RSVP Management & Gate 5 Completion E2E', () => {
  test.skip(
    process.env.P7_LIVE_E2E !== '1',
    'Live Phase 7 RSVP Management E2E runs via `npm run test:e2e:phase7:live` (`P7_LIVE_E2E=1`).',
  );

  test('proves Gate 5 end-to-end: custom RSVP questions, household attendance cap enforcement, atomic v1 RSVP submit + v2 update on /i/:token, organizer live RSVP dashboard, live RSVP close lock, zero token echo, and viewer read-only RBAC', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(120_000);

    const isMobile = testInfo.project.name === 'chromium-mobile';
    const creds = getCredentialsForProject(testInfo.project.name);
    const shortTag = `${isMobile ? 'mob' : 'dsk'}-${creds.runTag}`;
    const workspaceName = `RSVP Studio ${shortTag}`;
    const slug = `clara-mateo-rsvp-${shortTag}`;

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[organizer] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      pageErrors.push(`[organizer] ${err.message}`);
    });

    // Separate completely unauthenticated invited household browser context (zero cookies / storage)
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
      await page.getByLabel('Partner 1 name').fill('Clara');
      await page.getByLabel('Partner 2 name').fill('Mateo');
      await page.getByLabel(/Public URL slug/i).fill(slug);
      await page.getByLabel(/Celebration date/i).fill('2027-07-17');
      await page.getByLabel(/Venue name/i).fill('Glass Conservatory');
      await page.getByTestId('wizard-next-step-button').click();
      await page.getByLabel('Wedding IANA timezone').selectOption('Asia/Manila');
      await page.getByLabel('Website access policy').selectOption('invite_only');
      await page.getByTestId('create-wedding-submit-button').click();

      await expect(page.getByTestId('wedding-publishing-card')).toBeVisible({ timeout: 15_000 });

      // 2. Organizer opens `/app/weddings/:weddingId/rsvps` and adds 2 required custom questions
      await page.getByTestId('summary-open-rsvps-link').click();
      await expect(page.getByTestId('route-organizer-wedding-rsvps')).toBeVisible({
        timeout: 15_000,
      });
      const rsvpsAdminUrl = page.url();

      await page.getByTestId('open-create-rsvp-question-button').click();
      await page.getByTestId('rsvp-question-label-input').fill('Entrée Preference');
      await page.getByTestId('rsvp-question-type-select').selectOption('single_select');
      await page
        .getByTestId('rsvp-question-options-input')
        .fill('Herb-Crusted Salmon, Truffle Risotto');
      await page.getByTestId('rsvp-question-required-checkbox').check();
      await page.getByTestId('save-rsvp-question-button').click();
      await expect(page.getByTestId('rsvp-questions-manager-card')).toContainText(
        'Entrée Preference',
        { timeout: 10_000 },
      );

      await page.getByTestId('open-create-rsvp-question-button').click();
      await page.getByTestId('rsvp-question-label-input').fill('Ride hotel shuttle?');
      await page.getByTestId('rsvp-question-type-select').selectOption('boolean');
      await page.getByTestId('rsvp-question-required-checkbox').check();
      await page.getByTestId('save-rsvp-question-button').click();
      await expect(page.getByTestId('rsvp-questions-manager-card')).toContainText(
        'Ride hotel shuttle?',
        { timeout: 10_000 },
      );

      // 3. Organizer switches to Guest Directory, creates "The Rivera Family" (`max_attendees = 2`) with 3 named members, and issues `/i/:token`
      await page.getByTestId('rsvps-open-guests-link').click();
      await expect(page.getByTestId('route-organizer-wedding-guests')).toBeVisible({
        timeout: 15_000,
      });

      await page.getByTestId('open-create-household-button').click();
      await page.getByTestId('household-display-name-input').fill('The Rivera Family');
      await page.getByTestId('household-max-attendees-input').fill('2');
      await page.getByTestId('save-household-button').click();

      const riveraCard = page
        .locator('[data-testid^="household-card-"]')
        .filter({ hasText: 'The Rivera Family' });
      await expect(riveraCard).toBeVisible({ timeout: 10_000 });

      for (const firstName of ['Elena', 'Mateo', 'Lucas']) {
        await riveraCard.locator('[data-testid^="add-guest-to-group-"]').click();
        await riveraCard.getByTestId('guest-first-name-input').fill(firstName);
        await riveraCard.getByTestId('guest-last-name-input').fill('Rivera');
        await riveraCard.getByTestId('save-guest-button').click();
        await expect(riveraCard).toContainText(`${firstName} Rivera`);
      }

      await riveraCard.locator('[data-testid^="issue-invitation-"]').click();
      await expect(page.getByTestId('issued-invitation-qr-card')).toBeVisible({ timeout: 10_000 });

      const fullInvitationUrl = await page.getByTestId('issued-invitation-url-input').inputValue();
      const tokenPath = new URL(fullInvitationUrl).pathname;
      const rawToken = tokenPath.replace('/i/', '');

      // 4. Publish Snapshot v1
      await page.getByTestId('guests-back-to-overview-link').click();
      await expect(page.getByTestId('wedding-publishing-card')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('publish-wedding-button').click();
      await expect(page.getByTestId('publishing-active-version-badge')).toContainText('v1', {
        timeout: 15_000,
      });

      // 5. Invited household opens `/i/:token` -> tests `max_attendees = 2` cap guard -> submits valid v1 RSVP!
      await guestPage.goto(tokenPath);
      await expect(guestPage.getByTestId('household-rsvp-form-card')).toBeVisible({
        timeout: 15_000,
      });

      // Selecting the 3rd member ("Lucas Rivera") triggers capacity cap guard (`3 of 2 spots selected`)
      const lucasRow = guestPage
        .locator('[data-testid^="rsvp-member-row-"]')
        .filter({ hasText: 'Lucas Rivera' });
      await lucasRow.locator('[data-testid^="rsvp-guest-attending-"]').click();
      await expect(guestPage.getByTestId('rsvp-live-capacity-badge')).toContainText(
        '3 of 2 spots selected',
      );
      await guestPage.getByTestId('rsvp-submit-button').click();
      await expect(guestPage.getByTestId('rsvp-submit-error')).toContainText(
        'reserved for up to 2 guests',
      );

      // Mark Lucas Unable to Attend, fill dietary + custom questions + note, submit v1
      await lucasRow.locator('[data-testid^="rsvp-guest-declined-"]').click();

      const elenaRow = guestPage
        .locator('[data-testid^="rsvp-member-row-"]')
        .filter({ hasText: 'Elena Rivera' });
      await elenaRow.locator('[data-testid^="rsvp-guest-dietary-"]').fill('Vegetarian');

      const questionSelects = guestPage.locator('[data-testid^="rsvp-question-input-"]');
      await questionSelects.nth(0).selectOption('Truffle Risotto');
      await questionSelects.nth(1).selectOption('yes');
      await guestPage
        .getByTestId('rsvp-household-note-input')
        .fill('We are thrilled to celebrate!');
      await guestPage.getByTestId('rsvp-submit-button').click();

      await expect(guestPage.getByTestId('public-rsvp-confirmed-summary')).toContainText(
        'Confirmed Attending (2 guests)',
        { timeout: 15_000 },
      );
      await expect(guestPage.getByTestId('rsvp-response-version-badge')).toHaveText('Response v1');
      expect(await guestPage.content()).not.toContain(rawToken);

      // 6. Reload `/i/:token` -> confirms persisted v1 state -> update to v2 (1 attending guest)
      await guestPage.reload();
      await expect(guestPage.getByTestId('public-rsvp-confirmed-summary')).toContainText(
        'Confirmed Attending (2 guests)',
        { timeout: 15_000 },
      );

      await guestPage.getByTestId('public-rsvp-edit-button').click();
      const mateoRow = guestPage
        .locator('[data-testid^="rsvp-member-row-"]')
        .filter({ hasText: 'Mateo Rivera' });
      await mateoRow.locator('[data-testid^="rsvp-guest-declined-"]').click();
      await guestPage.getByTestId('rsvp-submit-button').click();

      await expect(guestPage.getByTestId('public-rsvp-confirmed-summary')).toContainText(
        'Confirmed Attending (1 guest)',
        { timeout: 15_000 },
      );
      await expect(guestPage.getByTestId('rsvp-response-version-badge')).toHaveText('Response v2');

      // 7. Organizer inspects live RSVP dashboard -> verifies Response v2, 1 attending guest, Vegetarian note & Truffle Risotto!
      await page.getByTestId('summary-open-rsvps-link').click();
      await expect(page.getByTestId('rsvp-metric-attending-guests')).toHaveText('1', {
        timeout: 15_000,
      });
      await expect(page.getByTestId('rsvp-responses-card')).toContainText('Response v2');
      await expect(page.getByTestId('rsvp-responses-card')).toContainText('Truffle Risotto');
      await expect(page.getByTestId('rsvp-responses-card')).toContainText('Vegetarian');

      // 8. Organizer closes RSVPs in WeddingSettingsCard -> `/i/:token` immediately locks further edits!
      await page.getByTestId('rsvps-back-to-overview-link').click();
      await page.getByLabel(/RSVP collection enabled/i).uncheck();
      await page.getByTestId('save-wedding-settings-button').click();
      await expect(page.getByTestId('wedding-settings-saved-notice')).toBeVisible({
        timeout: 10_000,
      });

      await guestPage.reload();
      await expect(guestPage.getByTestId('public-rsvp-closed-banner')).toBeVisible({
        timeout: 15_000,
      });
      await expect(guestPage.getByTestId('public-rsvp-edit-button')).toHaveCount(0);
      expect(await guestPage.content()).not.toContain(rawToken);

      // 9. Workspace Viewer opens `/rsvps` -> sees live response in read-only mode with zero question mutation controls
      await page.getByTestId('organizer-signout-button').click();
      await expect(page.getByTestId('route-organizer-login')).toBeVisible({ timeout: 15_000 });

      await page.getByLabel('Email address').fill(creds.viewerEmail);
      await page.getByLabel('Password', { exact: true }).fill(creds.password);
      await page.getByTestId('login-submit-button').click();
      await expect(page.getByTestId('active-workspace-heading')).toHaveText(workspaceName, {
        timeout: 15_000,
      });

      await page.goto(rsvpsAdminUrl);
      await expect(page.getByTestId('rsvp-viewer-readonly-banner')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId('open-create-rsvp-question-button')).toHaveCount(0);
      await expect(page.getByTestId('rsvp-responses-card')).toContainText('The Rivera Family');

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await guestContext.close();
    }
  });
});
