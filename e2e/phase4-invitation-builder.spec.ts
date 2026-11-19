import { expect, test } from '@playwright/test';

interface Phase4ActorCredentials {
  readonly ownerEmail: string;
  readonly viewerEmail: string;
  readonly password: string;
  readonly runTag: string;
}

function getCredentialsForProject(projectName: string): Phase4ActorCredentials {
  const prefix = projectName === 'chromium-mobile' ? 'P4_E2E_MOBILE' : 'P4_E2E_DESKTOP';
  return {
    ownerEmail: process.env[`${prefix}_OWNER_EMAIL`] ?? '',
    viewerEmail: process.env[`${prefix}_VIEWER_EMAIL`] ?? '',
    password: process.env.P4_E2E_PASSWORD ?? '',
    runTag: process.env.P4_E2E_RUN_TAG ?? 'p4e2e',
  };
}

test.describe('Phase 4 Live Invitation Builder & Live Preview E2E (Gate 3 Completion)', () => {
  test.skip(
    process.env.P4_LIVE_E2E !== '1',
    'Live Phase 4 Invitation Builder E2E runs via `npm run test:e2e:phase4:live` (`P4_LIVE_E2E=1`).',
  );

  test('edits, reorders, customizes tokens, and debounced-autosaves two distinct weddings through <InvitationRenderer />, blocks invalid URLs, isolates workspaces, and enforces viewer read-only RBAC', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);

    const isMobile = testInfo.project.name === 'chromium-mobile';
    const creds = getCredentialsForProject(testInfo.project.name);
    const shortTag = `${isMobile ? 'mob' : 'dsk'}-${creds.runTag}`;
    const workspaceAName = `Builder Studio A ${shortTag}`;
    const workspaceBName = `Builder Studio B ${shortTag}`;
    const slugA = `elena-mateo-bld-${shortTag}`;
    const slugB = `clara-julian-bld-${shortTag}`;

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // 1. Sign in as Owner -> create Workspace A & add Viewer co-member
    await page.goto('/app/login');
    await page.getByLabel('Email address').fill(creds.ownerEmail);
    await page.getByLabel('Password', { exact: true }).fill(creds.password);
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('workspace-onboarding-card')).toBeVisible({ timeout: 15_000 });
    await page.getByLabel('Workspace name').fill(workspaceAName);
    await page.getByTestId('create-workspace-submit-button').click();
    await expect(page.getByTestId('active-workspace-heading')).toHaveText(workspaceAName);

    await page.getByTestId('go-to-workspace-settings-link').click();
    await page.getByLabel('Organizer email').fill(creds.viewerEmail);
    await page.getByTestId('add-member-role-select').selectOption('viewer');
    await page.getByTestId('add-member-submit-button').click();
    await expect(page.getByTestId('add-member-success')).toContainText(creds.viewerEmail);

    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    await expect(page.getByTestId('active-workspace-heading')).toHaveText(workspaceAName);

    // Create Workspace B as well so we can test live workspace-switcher isolation inside the Builder
    await page.getByTestId('toggle-create-workspace-button').click();
    await page.getByLabel('Workspace name').fill(workspaceBName);
    await page.getByTestId('create-workspace-submit-button').click();
    await expect(page.getByTestId('active-workspace-heading')).toHaveText(workspaceBName);

    const wsAOptionValue = await page
      .getByTestId('workspace-switcher')
      .locator('option', { hasText: workspaceAName })
      .getAttribute('value');
    const wsBOptionValue = await page
      .getByTestId('workspace-switcher')
      .locator('option', { hasText: workspaceBName })
      .getAttribute('value');
    expect(wsAOptionValue).toBeTruthy();
    expect(wsBOptionValue).toBeTruthy();

    await page.getByTestId('workspace-switcher').selectOption(wsAOptionValue!);
    await expect(page.getByTestId('active-workspace-heading')).toHaveText(workspaceAName);

    // 2. Create Wedding A -> open Invitation Builder (`/app/weddings/:weddingId/builder`)
    await page.getByTestId('open-create-wedding-wizard-button').click();
    await page.getByLabel('Partner 1 name').fill('Elena');
    await page.getByLabel('Partner 2 name').fill('Mateo');
    await page.getByLabel(/Public URL slug/i).fill(slugA);
    await page.getByLabel(/Celebration date/i).fill('2027-06-19');
    await page.getByLabel(/Venue name/i).fill('Villa Aurelia');
    await page.getByTestId('wizard-next-step-button').click();

    await page.getByLabel('Wedding IANA timezone').selectOption('Asia/Manila');
    await page.getByTestId('create-wedding-submit-button').click();

    await expect(page.getByTestId('wedding-design-preview-card')).toBeVisible({ timeout: 15_000 });
    const weddingADetailUrl = page.url();
    const weddingABuilderUrl = `${weddingADetailUrl}/builder`;

    await page.getByTestId('open-invitation-builder-link').click();
    await expect(page.getByTestId('wedding-invitation-builder')).toBeVisible({ timeout: 15_000 });

    // 3. Customize Wedding A Theme & Token Overrides (`terracotta_atelier`, `#8C3B2B`, `arch`, `botanical_flourish`)
    await page.getByTestId('inspector-tab-theme').click();
    await page.getByTestId('builder-theme-preset-terracotta_atelier').click();
    await page.getByTestId('theme-accent-swatch-8C3B2B').click();
    await page.getByTestId('theme-corner-style-select').selectOption('arch');
    await page.getByTestId('theme-ornament-style-select').selectOption('botanical_flourish');

    await expect(page.getByTestId('builder-autosave-status')).toHaveAttribute(
      'data-autosave-state',
      'saved',
      { timeout: 10_000 },
    );

    // 4. Customize Wedding A Sections: reorder `our_story` down, show `faq_notes`, edit Hero, test `http://` rejection -> fix to `https://`
    await page.getByTestId('inspector-tab-sections').click();
    await page.getByTestId('move-section-down-our_story').click();
    await page.getByTestId('toggle-section-visibility-faq_notes').click();

    await page.getByTestId('select-section-hero').click();
    await page.getByTestId('hero-couple-headline-input').fill('Elena & Mateo — Tagaytay Sunset');

    await page.getByTestId('select-section-venue_travel').click();
    await page.getByTestId('venue-map-url-input').fill('http://insecure-venue.example.com');

    await expect(page.getByTestId('builder-autosave-status')).toHaveAttribute(
      'data-autosave-state',
      'validation_error',
    );
    await expect(page.getByTestId('builder-validation-banner')).toContainText('https://');

    await page.getByTestId('venue-map-url-input').fill('https://maps.example.com/villa-aurelia');
    await expect(page.getByTestId('builder-autosave-status')).toHaveAttribute(
      'data-autosave-state',
      'saved',
      { timeout: 10_000 },
    );

    // Reload Wedding A Builder -> verify 100% persistence of theme, tokens, order, visibility, and copy
    await page.reload();
    await expect(page.getByTestId('wedding-invitation-builder')).toBeVisible({ timeout: 15_000 });

    if (isMobile) {
      await page.getByTestId('mobile-pane-preview-tab').click();
    }

    const rendererA = page.getByTestId('invitation-renderer');
    await expect(rendererA).toHaveAttribute('data-theme-preset', 'terracotta_atelier');
    await expect(rendererA).toHaveAttribute('style', /--inv-accent:\s*#8C3B2B/i);
    await expect(page.getByTestId('invitation-hero-headline')).toHaveText(
      'Elena & Mateo — Tagaytay Sunset',
    );
    await expect(page.getByTestId('invitation-section-faq_notes')).toBeVisible();
    await expect(page.getByRole('link', { name: /Open Venue Map/i })).toHaveAttribute(
      'href',
      'https://maps.example.com/villa-aurelia',
    );

    const orderedRenderedA = page.locator('[data-testid^="invitation-section-"]');
    await expect(orderedRenderedA.nth(0)).toHaveAttribute('data-testid', 'invitation-section-hero');
    await expect(orderedRenderedA.nth(1)).toHaveAttribute(
      'data-testid',
      'invitation-section-event_schedule',
    );
    await expect(orderedRenderedA.nth(2)).toHaveAttribute(
      'data-testid',
      'invitation-section-our_story',
    );

    // Toggle Mobile preview frame inside Builder
    await page.getByTestId('builder-viewport-mobile-button').click();
    await expect(page.getByTestId('invitation-viewport-frame')).toHaveAttribute(
      'data-viewport-mode',
      'mobile',
    );

    // 5. Create Wedding B (Gate 3 second distinct wedding configuration: `celestial_midnight` dark gala)
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    await expect(page.getByTestId('active-workspace-heading')).toHaveText(workspaceAName);
    await page.getByTestId('open-create-wedding-wizard-button').click();
    await page.getByLabel('Partner 1 name').fill('Clara');
    await page.getByLabel('Partner 2 name').fill('Julian');
    await page.getByLabel(/Public URL slug/i).fill(slugB);
    await page.getByLabel(/Celebration date/i).fill('2027-11-06');
    await page.getByLabel(/Venue name/i).fill('Harbor Glasshouse');
    await page.getByTestId('wizard-next-step-button').click();
    await page.getByLabel('Wedding IANA timezone').selectOption('America/New_York');
    await page.getByTestId('create-wedding-submit-button').click();

    await page.getByTestId('open-invitation-builder-link').click();
    await expect(page.getByTestId('wedding-invitation-builder')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('inspector-tab-theme').click();
    await page.getByTestId('builder-theme-preset-celestial_midnight').click();
    await page.getByTestId('theme-heading-font-select').selectOption('modern_sans');

    await page.getByTestId('inspector-tab-sections').click();
    await page.getByTestId('select-section-rsvp_banner').click();
    await page.getByTestId('rsvp-banner-heading-input').fill('Black-Tie Evening RSVP');

    await expect(page.getByTestId('builder-autosave-status')).toHaveAttribute(
      'data-autosave-state',
      'saved',
      { timeout: 10_000 },
    );

    if (isMobile) {
      await page.getByTestId('mobile-pane-preview-tab').click();
    }
    await expect(page.getByTestId('invitation-renderer')).toHaveAttribute(
      'data-theme-preset',
      'celestial_midnight',
    );
    await expect(page.getByTestId('invitation-renderer')).toHaveAttribute(
      'data-dark-surface',
      'true',
    );
    await expect(page.getByTestId('invitation-section-rsvp_banner')).toContainText(
      'Black-Tie Evening RSVP',
    );

    // 6. Live Workspace-Switch Isolation while inside Builder (`P4-AC08`)
    await page.getByTestId('workspace-switcher').selectOption(wsBOptionValue!);
    await expect(page.getByTestId('wedding-builder-workspace-mismatch-card')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('wedding-invitation-builder')).toHaveCount(0);

    // Sign out Owner -> sign in as Viewer -> verify Wedding A Builder is strictly Read-Only
    await page.getByTestId('organizer-signout-button').click();
    await expect(page.getByTestId('route-organizer-login')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Email address').fill(creds.viewerEmail);
    await page.getByLabel('Password', { exact: true }).fill(creds.password);
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('active-workspace-heading')).toHaveText(workspaceAName, {
      timeout: 15_000,
    });

    await page.goto(weddingABuilderUrl);
    await expect(page.getByTestId('builder-readonly-badge')).toContainText('Read-only (Viewer)', {
      timeout: 15_000,
    });

    if (isMobile) {
      await page.getByTestId('mobile-pane-editor-tab').click();
    }
    await expect(page.getByTestId('hero-couple-headline-input')).toBeDisabled();
    await expect(page.getByTestId('toggle-section-visibility-hero')).toBeDisabled();
    await expect(page.getByTestId('move-section-down-hero')).toBeDisabled();

    await page.getByTestId('inspector-tab-theme').click();
    await expect(page.getByTestId('builder-theme-preset-editorial_ivory')).toBeDisabled();
    await expect(page.getByTestId('theme-accent-hex-input')).toBeDisabled();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
