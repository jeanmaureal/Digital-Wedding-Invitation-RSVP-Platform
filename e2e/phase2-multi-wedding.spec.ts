import { expect, test } from '@playwright/test';

interface Phase2ActorCredentials {
  readonly ownerAlphaEmail: string;
  readonly editorAlphaEmail: string;
  readonly viewerAlphaEmail: string;
  readonly outsiderOwnerEmail: string;
  readonly password: string;
  readonly runTag: string;
}

function getCredentialsForProject(projectName: string): Phase2ActorCredentials {
  const prefix = projectName === 'chromium-mobile' ? 'P2_E2E_MOBILE' : 'P2_E2E_DESKTOP';
  return {
    ownerAlphaEmail: process.env[`${prefix}_OWNER_EMAIL`] ?? '',
    editorAlphaEmail: process.env[`${prefix}_EDITOR_EMAIL`] ?? '',
    viewerAlphaEmail: process.env[`${prefix}_VIEWER_EMAIL`] ?? '',
    outsiderOwnerEmail: process.env[`${prefix}_OUTSIDER_EMAIL`] ?? '',
    password: process.env.P2_E2E_PASSWORD ?? '',
    runTag: process.env.P2_E2E_RUN_TAG ?? 'p2e2e',
  };
}

test.describe('Phase 2 Live Multi-Wedding Architecture & Gate 2 Isolation E2E', () => {
  test.skip(
    process.env.P2_LIVE_E2E !== '1',
    'Live Phase 2 multi-wedding E2E runs via `npm run test:e2e:phase2:live` (`P2_LIVE_E2E=1`).',
  );

  test('verifies multi-wedding wizard, IANA timezone settings, duplication, archiving, RBAC, workspace-switch guard, cross-tenant RLS isolation, and public draft non-leakage', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);

    const creds = getCredentialsForProject(testInfo.project.name);
    const shortTag = `${testInfo.project.name === 'chromium-mobile' ? 'mob' : 'dsk'}-${creds.runTag}`;
    const wsAlphaName = `Studio Alpha ${shortTag}`;
    const wsBetaName = `Studio Beta ${shortTag}`;
    const wsOutsiderName = `Outsider Studio ${shortTag}`;
    const primarySlug = `elena-mateo-${shortTag}`;

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    let expectingNegativeRpcRejection = false;

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (expectingNegativeRpcRejection && text.startsWith('Failed to load resource:')) {
          return;
        }
        consoleErrors.push(text);
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // 1. Unauthenticated cold deep-link to `/app/weddings/:weddingId` preserves `redirectTo` (`P2-AC11`)
    const probeId = '11111111-2222-4333-8444-555555555555';
    await page.goto(`/app/weddings/${probeId}`);
    await expect(page.getByTestId('route-organizer-login')).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/app/login\\?redirectTo=%2Fapp%2Fweddings%2F${probeId}$`),
    );

    // 2. Sign in as Owner Alpha -> create Workspace Alpha & Workspace Beta, add Editor + Viewer to Alpha
    await page.getByLabel('Email address').fill(creds.ownerAlphaEmail);
    await page.getByLabel('Password', { exact: true }).fill(creds.password);
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('wedding-detail-no-workspace-card')).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('link', { name: 'Go to workspace onboarding' }).click();

    await page.getByLabel('Workspace name').fill(wsAlphaName);
    await page.getByTestId('create-workspace-submit-button').click();
    await expect(page.getByTestId('active-workspace-heading')).toHaveText(wsAlphaName);
    await expect(page.getByTestId('weddings-empty-card')).toBeVisible();

    // Add Editor & Viewer to Studio Alpha
    await page.getByTestId('go-to-workspace-settings-link').click();
    await expect(page.getByTestId('route-organizer-settings')).toBeVisible();

    await page.getByLabel('Organizer email').fill(creds.editorAlphaEmail);
    await page.getByTestId('add-member-role-select').selectOption('editor');
    await page.getByTestId('add-member-submit-button').click();
    await expect(page.getByTestId('add-member-success')).toContainText(creds.editorAlphaEmail);

    await page.getByLabel('Organizer email').fill(creds.viewerAlphaEmail);
    await page.getByTestId('add-member-role-select').selectOption('viewer');
    await page.getByTestId('add-member-submit-button').click();
    await expect(page.getByTestId('add-member-success')).toContainText(creds.viewerAlphaEmail);

    // Return to Overview and also create Studio Beta (to test multi-workspace switching)
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    await expect(page.getByTestId('active-workspace-heading')).toHaveText(wsAlphaName);

    await page.getByTestId('toggle-create-workspace-button').click();
    await page.getByLabel('Workspace name').fill(wsBetaName);
    await page.getByTestId('create-workspace-submit-button').click();
    await expect(page.getByTestId('active-workspace-heading')).toHaveText(wsBetaName);

    // Switch back to Studio Alpha via header switcher
    const wsAlphaOptionValue = await page
      .getByTestId('workspace-switcher')
      .locator('option', { hasText: wsAlphaName })
      .getAttribute('value');
    const wsBetaOptionValue = await page
      .getByTestId('workspace-switcher')
      .locator('option', { hasText: wsBetaName })
      .getAttribute('value');
    expect(wsAlphaOptionValue).toBeTruthy();
    expect(wsBetaOptionValue).toBeTruthy();

    await page.getByTestId('workspace-switcher').selectOption(wsAlphaOptionValue!);
    await expect(page.getByTestId('active-workspace-heading')).toHaveText(wsAlphaName);

    // 3. Create Wedding 1 in Studio Alpha via 2-step Creation Wizard (`Asia/Manila`, `invite_only`, deadline)
    await page.getByTestId('open-create-wedding-wizard-button').click();
    await expect(page.getByTestId('wedding-wizard-step-badge')).toHaveText('Step 1 of 2');

    await page.getByLabel('Partner 1 name').fill('Elena');
    await page.getByLabel('Partner 2 name').fill('Mateo');
    await expect(page.getByLabel('Project title')).toHaveValue("Elena & Mateo's Wedding");
    await page.getByLabel(/Public URL slug/i).fill(primarySlug);
    await page.getByLabel(/Celebration date/i).fill('2027-06-19');
    await page.getByLabel(/Venue name/i).fill('San Agustin Church');
    await page.getByTestId('wizard-next-step-button').click();

    await expect(page.getByTestId('wedding-wizard-step-badge')).toHaveText('Step 2 of 2');
    await page.getByLabel('Wedding IANA timezone').selectOption('Asia/Manila');
    await page.getByLabel('Website access policy').selectOption('invite_only');
    await page.getByLabel(/RSVP deadline date/i).fill('2027-05-15');
    await page.getByLabel(/Deadline time/i).fill('23:59');
    await page.getByTestId('create-wedding-submit-button').click();

    // Verify `/app/weddings/:weddingId` loads and persists across full browser reload
    await expect(page.getByTestId('route-organizer-wedding-detail')).toBeVisible({
      timeout: 15_000,
    });
    const alphaWeddingUrl = page.url();
    await expect(page.getByTestId('wedding-detail-heading')).toHaveText("Elena & Mateo's Wedding");
    await expect(page.getByTestId('detail-wedding-slug-badge')).toHaveText(`/w/${primarySlug}`);

    await page.reload();
    await expect(page.getByTestId('wedding-detail-heading')).toHaveText("Elena & Mateo's Wedding");
    await expect(page.getByLabel('Deadline time (Asia/Manila)')).toHaveValue('23:59');

    // Update Dress Code setting and save
    await page.getByLabel('Dress code guidance').fill('Formal Filipiniana');
    await page.getByTestId('save-wedding-settings-button').click();
    await expect(page.getByTestId('wedding-settings-saved-notice')).toBeVisible();

    // 4. Switch active workspace to Studio Beta while on Studio Alpha's `/app/weddings/:weddingId` (`P2-AC09`)
    await page.getByTestId('workspace-switcher').selectOption(wsBetaOptionValue!);
    await expect(page.getByTestId('wedding-workspace-mismatch-card')).toBeVisible();
    await expect(page.getByTestId('wedding-details-card')).toHaveCount(0);

    await page.getByTestId('mismatch-back-to-overview-link').click();
    await expect(page.getByTestId('active-workspace-heading')).toHaveText(wsBetaName);
    await expect(page.getByTestId('weddings-empty-card')).toBeVisible();

    // 5. Sign out Owner Alpha -> sign in as Editor Alpha (`P2-AC05`: duplicate + archive/restore allowed; delete restricted)
    await page.getByTestId('organizer-signout-button').click();
    await expect(page.getByTestId('route-organizer-login')).toBeVisible();

    await page.getByLabel('Email address').fill(creds.editorAlphaEmail);
    await page.getByLabel('Password', { exact: true }).fill(creds.password);
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('active-workspace-heading')).toHaveText(wsAlphaName);
    await expect(page.getByTestId(`wedding-project-card-${primarySlug}`)).toBeVisible();

    await page.getByTestId(`duplicate-wedding-button-${primarySlug}`).click();
    const dupSlug = `clara-julian-${shortTag}`;
    await page.getByLabel('New public URL slug').fill(dupSlug);
    await page.getByLabel('Partner 1 name').fill('Clara');
    await page.getByLabel('Partner 2 name').fill('Julian');
    await page.getByTestId('duplicate-wedding-submit-button').click();

    await expect(page.getByTestId('wedding-detail-heading')).toHaveText(
      "Copy of Elena & Mateo's Wedding",
    );
    // Cloned settings preserved `Asia/Manila` & `Formal Filipiniana`, while resetting `rsvp_deadline` cleanly
    await expect(page.getByLabel('Dress code guidance')).toHaveValue('Formal Filipiniana');
    await expect(page.getByLabel('RSVP deadline date')).toHaveValue('');
    await expect(page.getByTestId('delete-wedding-restricted-notice')).toBeVisible();
    await expect(page.getByTestId('delete-wedding-button')).toHaveCount(0);

    // Editor archives & restores duplicated project
    await page.getByTestId('detail-archive-wedding-button').click();
    await expect(page.getByTestId('detail-wedding-status-badge')).toHaveText('Archived');
    await page.getByTestId('detail-archive-wedding-button').click();
    await expect(page.getByTestId('detail-wedding-status-badge')).toHaveText('Draft');

    await page.getByTestId('back-to-weddings-link').click();
    await expect(page.getByTestId(`wedding-duplicated-badge-${dupSlug}`)).toBeVisible();

    // 6. Sign out Editor -> sign in as Viewer Alpha (`P2-AC05`: strictly read-only)
    await page.getByTestId('organizer-signout-button').click();
    await page.getByLabel('Email address').fill(creds.viewerAlphaEmail);
    await page.getByLabel('Password', { exact: true }).fill(creds.password);
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('wedding-viewer-readonly-badge')).toBeVisible();
    await expect(page.getByTestId('open-create-wedding-wizard-button')).toHaveCount(0);
    await page.getByTestId(`open-wedding-button-${primarySlug}`).click();
    await expect(page.getByTestId('wedding-details-readonly-badge')).toBeVisible();
    await expect(page.getByTestId('wedding-settings-readonly-badge')).toBeVisible();
    await expect(page.getByTestId('save-wedding-details-button')).toHaveCount(0);

    // 7. Sign out Viewer -> sign in as unrelated Outsider Organizer (`Gate 2` cross-tenant isolation!)
    await page.getByTestId('organizer-signout-button').click();
    await page.getByLabel('Email address').fill(creds.outsiderOwnerEmail);
    await page.getByLabel('Password', { exact: true }).fill(creds.password);
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('workspace-onboarding-card')).toBeVisible();
    await page.getByLabel('Workspace name').fill(wsOutsiderName);
    await page.getByTestId('create-workspace-submit-button').click();
    await expect(page.getByTestId('weddings-empty-card')).toBeVisible();

    // Outsider attempts direct URL navigation to Studio Alpha's wedding -> zero leakage!
    await page.goto(alphaWeddingUrl);
    await expect(page.getByTestId('wedding-workspace-mismatch-card')).toBeVisible();
    await expect(page.locator('body')).not.toContainText("Elena & Mateo's Wedding");
    await expect(page.locator('body')).not.toContainText('San Agustin Church');

    // Outsider attempts to claim `primarySlug` -> rejected with `WEDDING_SLUG_TAKEN` without leaking Alpha data
    await page.getByTestId('mismatch-back-to-overview-link').click();
    await page.getByTestId('open-create-wedding-wizard-button').click();
    await page.getByLabel('Partner 1 name').fill('Nora');
    await page.getByLabel('Partner 2 name').fill('Theo');
    await page.getByLabel(/Public URL slug/i).fill(primarySlug);
    await page.getByTestId('wizard-next-step-button').click();

    expectingNegativeRpcRejection = true;
    await page.getByTestId('create-wedding-submit-button').click();
    await expect(page.getByTestId('create-wedding-error')).toContainText(
      'That public wedding URL slug is already in use',
    );
    expectingNegativeRpcRejection = false;

    // 8. Sign out and verify unauthenticated `/w/<draft-slug>` leaks zero draft details (`P2-AC14`)
    await page.getByTestId('organizer-signout-button').click();
    await expect(page.getByTestId('route-organizer-login')).toBeVisible();

    await page.goto(`/w/${primarySlug}`);
    await expect(page.getByTestId('public-shell')).toBeVisible();
    await expect(page.getByTestId('route-public-wedding')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('San Agustin Church');
    await expect(page.locator('body')).not.toContainText('Elena');

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
