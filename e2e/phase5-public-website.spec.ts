import { expect, test } from '@playwright/test';

interface Phase5ActorCredentials {
  readonly ownerEmail: string;
  readonly viewerEmail: string;
  readonly password: string;
  readonly runTag: string;
}

function getCredentialsForProject(projectName: string): Phase5ActorCredentials {
  const prefix = projectName === 'chromium-mobile' ? 'P5_E2E_MOBILE' : 'P5_E2E_DESKTOP';
  return {
    ownerEmail: process.env[`${prefix}_OWNER_EMAIL`] ?? '',
    viewerEmail: process.env[`${prefix}_VIEWER_EMAIL`] ?? '',
    password: process.env.P5_E2E_PASSWORD ?? '',
    runTag: process.env.P5_E2E_RUN_TAG ?? 'p5e2e',
  };
}

test.describe('Phase 5 Live Public Wedding Website & Snapshot Publishing E2E (Gate 4)', () => {
  test.skip(
    process.env.P5_LIVE_E2E !== '1',
    'Live Phase 5 Public Website E2E runs via `npm run test:e2e:phase5:live` (`P5_LIVE_E2E=1`).',
  );

  test('proves Gate 4: unpublished drafts stay private, published v1 renders to unauthenticated visitors, post-publish draft edits stay isolated until v2 republish, invite_only locks public access, unpublish takes offline, and viewer is read-only', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(120_000);

    const isMobile = testInfo.project.name === 'chromium-mobile';
    const creds = getCredentialsForProject(testInfo.project.name);
    const shortTag = `${isMobile ? 'mob' : 'dsk'}-${creds.runTag}`;
    const workspaceName = `Publish Studio ${shortTag}`;
    const slug = `elena-mateo-pub-${shortTag}`;
    const publicPath = `/w/${slug}`;

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[organizer] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      pageErrors.push(`[organizer] ${err.message}`);
    });

    // Separate completely unauthenticated public visitor browser context (zero cookies / storage)
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();

    publicPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[public] ${msg.text()}`);
    });
    publicPage.on('pageerror', (err) => {
      pageErrors.push(`[public] ${err.message}`);
    });

    try {
      // 1. Sign in as Organizer Owner -> create Workspace, add Viewer, create Draft Wedding
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
      await page.getByLabel('Partner 1 name').fill('Elena');
      await page.getByLabel('Partner 2 name').fill('Mateo');
      await page.getByLabel(/Public URL slug/i).fill(slug);
      await page.getByLabel(/Celebration date/i).fill('2027-06-19');
      await page.getByLabel(/Venue name/i).fill('Villa Aurelia');
      await page.getByTestId('wizard-next-step-button').click();
      await page.getByLabel('Wedding IANA timezone').selectOption('Asia/Manila');
      await page.getByTestId('create-wedding-submit-button').click();

      await expect(page.getByTestId('wedding-publishing-card')).toBeVisible({ timeout: 15_000 });
      const weddingDetailUrl = page.url();

      // 2. Unauthenticated visitor visits `/w/:slug` BEFORE publish -> unavailable (`Gate 4`)
      await publicPage.goto(publicPath);
      await expect(publicPage.getByTestId('public-wedding-unavailable')).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        publicPage.getByRole('heading', { name: 'Invitation Not Yet Available' }),
      ).toBeVisible();
      await expect(publicPage.getByTestId('invitation-renderer')).toHaveCount(0);

      // 3. Organizer customizes in Builder & publishes Snapshot v1 directly from Builder
      await page.getByTestId('open-invitation-builder-link').click();
      await expect(page.getByTestId('wedding-invitation-builder')).toBeVisible({ timeout: 15_000 });

      await page.getByTestId('inspector-tab-theme').click();
      await page.getByTestId('builder-theme-preset-garden_sage').click();

      await page.getByTestId('inspector-tab-sections').click();
      await page.getByTestId('select-section-hero').click();
      await page.getByTestId('hero-couple-headline-input').fill('Elena & Mateo — Published v1');

      await expect(page.getByTestId('builder-autosave-status')).toHaveAttribute(
        'data-autosave-state',
        'saved',
        { timeout: 10_000 },
      );

      await page.getByTestId('builder-publish-button').click();
      await expect(page.getByTestId('builder-publish-success-banner')).toContainText('v1', {
        timeout: 15_000,
      });

      // 4. Unauthenticated visitor reloads `/w/:slug` -> renders Published v1 via `<InvitationRenderer />`!
      await publicPage.reload();
      await expect(publicPage.getByTestId('invitation-renderer')).toHaveAttribute(
        'data-theme-preset',
        'garden_sage',
        { timeout: 15_000 },
      );
      await expect(publicPage.getByTestId('route-public-wedding')).toHaveAttribute(
        'data-published-version',
        '1',
      );
      await expect(publicPage.getByTestId('invitation-hero-headline')).toHaveText(
        'Elena & Mateo — Published v1',
      );

      // Verify RSVP guidance interaction on public `/w/:slug`
      await publicPage.getByTestId('invitation-hero-cta').click();
      await expect(publicPage.getByTestId('public-rsvp-guidance-card')).toBeVisible();

      // 5. Gate 4 Draft Isolation Proof: Organizer edits draft to `"Elena & Mateo — Draft v2 Unreleased"` (autosaved, NOT republished)
      await page
        .getByTestId('hero-couple-headline-input')
        .fill('Elena & Mateo — Draft v2 Unreleased');
      await expect(page.getByTestId('builder-autosave-status')).toHaveAttribute(
        'data-autosave-state',
        'saved',
        { timeout: 10_000 },
      );

      // Unauthenticated visitor reloads `/w/:slug` -> MUST STILL see `"Elena & Mateo — Published v1"`!
      await publicPage.reload();
      await expect(publicPage.getByTestId('invitation-hero-headline')).toHaveText(
        'Elena & Mateo — Published v1',
        { timeout: 15_000 },
      );
      await expect(publicPage.locator('body')).not.toContainText('Draft v2 Unreleased');

      // 6. Organizer returns to Wedding Detail -> sees `Unpublished draft changes` -> clicks `Republish website (v2)`
      await page.getByTestId('builder-back-to-wedding-button').click();
      await expect(page.getByTestId('unpublished-draft-changes-badge')).toBeVisible({
        timeout: 15_000,
      });
      await page.getByTestId('publish-wedding-button').click();
      await expect(page.getByTestId('publishing-active-version-badge')).toHaveText(
        'Published · v2',
        { timeout: 15_000 },
      );

      // Unauthenticated visitor reloads `/w/:slug` -> now sees `"Elena & Mateo — Draft v2 Unreleased"` (`v2`)!
      await publicPage.reload();
      await expect(publicPage.getByTestId('route-public-wedding')).toHaveAttribute(
        'data-published-version',
        '2',
        { timeout: 15_000 },
      );
      await expect(publicPage.getByTestId('invitation-hero-headline')).toHaveText(
        'Elena & Mateo — Draft v2 Unreleased',
      );

      // 7. Organizer switches `Website access policy` to `invite_only` -> immediate public lock!
      await page.getByLabel('Website access policy').selectOption('invite_only');
      await page.getByTestId('save-wedding-settings-button').click();
      await expect(page.getByTestId('wedding-settings-saved-notice')).toBeVisible();

      await publicPage.reload();
      await expect(publicPage.getByTestId('public-wedding-invite-only')).toBeVisible({
        timeout: 15_000,
      });
      await expect(publicPage.getByTestId('invitation-renderer')).toHaveCount(0);
      await expect(publicPage.locator('body')).not.toContainText('Villa Aurelia');
      await expect(publicPage.locator('body')).not.toContainText('Draft v2 Unreleased');

      // 8. Organizer restores `public` access policy, then clicks `Unpublish to Draft` -> public site goes offline!
      await page.getByLabel('Website access policy').selectOption('public');
      await page.getByTestId('save-wedding-settings-button').click();
      await expect(page.getByTestId('wedding-settings-saved-notice')).toBeVisible();

      await page.getByTestId('unpublish-wedding-button').click();
      await expect(page.getByTestId('publishing-draft-badge')).toContainText(
        'Draft · Not Published',
        { timeout: 15_000 },
      );
      await expect(page.getByTestId('publish-wedding-button')).toContainText(
        'Republish website (v3)',
      );

      await publicPage.reload();
      await expect(publicPage.getByTestId('public-wedding-unavailable')).toBeVisible({
        timeout: 15_000,
      });

      // 9. Viewer co-member opens Wedding Detail -> publishing controls are strictly Read-Only
      await page.getByTestId('organizer-signout-button').click();
      await expect(page.getByTestId('route-organizer-login')).toBeVisible({ timeout: 15_000 });

      await page.getByLabel('Email address').fill(creds.viewerEmail);
      await page.getByLabel('Password', { exact: true }).fill(creds.password);
      await page.getByTestId('login-submit-button').click();
      await expect(page.getByTestId('active-workspace-heading')).toHaveText(workspaceName, {
        timeout: 15_000,
      });

      await page.goto(weddingDetailUrl);
      await expect(page.getByTestId('publishing-readonly-badge')).toContainText(
        'Read-only (Viewer)',
        { timeout: 15_000 },
      );
      await expect(page.getByTestId('publish-wedding-button')).toBeDisabled();

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await publicContext.close();
    }
  });
});
