import { expect, test } from '@playwright/test';

interface ProjectActorCredentials {
  readonly ownerEmail: string;
  readonly viewerEmail: string;
  readonly editorEmail: string;
  readonly password: string;
  readonly runTag: string;
}

function getCredentialsForProject(projectName: string): ProjectActorCredentials {
  const prefix = projectName === 'chromium-mobile' ? 'P1_E2E_MOBILE' : 'P1_E2E_DESKTOP';
  const ownerEmail = process.env[`${prefix}_OWNER_EMAIL`] ?? '';
  const viewerEmail = process.env[`${prefix}_VIEWER_EMAIL`] ?? '';
  const editorEmail = process.env[`${prefix}_EDITOR_EMAIL`] ?? '';
  const password = process.env.P1_E2E_PASSWORD ?? '';
  const runTag = process.env.P1_E2E_RUN_TAG ?? 'e2e';

  return {
    ownerEmail,
    viewerEmail,
    editorEmail,
    password,
    runTag,
  };
}

test.describe('Phase 1 Live Multi-User Auth, Onboarding & Workspace RBAC E2E', () => {
  test.skip(
    process.env.P1_LIVE_E2E !== '1',
    'Live Supabase multi-user E2E runs via `npm run test:e2e:live` (`P1_LIVE_E2E=1`).',
  );

  test('completes real sign-in, 0-workspace onboarding, multi-workspace reload persistence, RBAC, and email privacy masking', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);

    const creds = getCredentialsForProject(testInfo.project.name);
    const projectShort = testInfo.project.name === 'chromium-mobile' ? 'mob' : 'dsk';
    const wsAlphaName = `Alpha ${projectShort} ${creds.runTag}`;
    const wsBetaName = `Beta ${projectShort} ${creds.runTag}`;

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    let expectingNegativeRpcRejection = false;

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // PostgREST maps PL/pgSQL `P0002` (`ORGANIZER_NOT_REGISTERED`) to a non-2xx HTTP response,
        // which Chromium reports as a `Failed to load resource` network console entry during that intentional negative step.
        if (expectingNegativeRpcRejection && text.startsWith('Failed to load resource:')) {
          return;
        }
        consoleErrors.push(text);
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // 1. Deep-link to /app/settings while unauthenticated -> redirects to /app/login?redirectTo=%2Fapp%2Fsettings
    await page.goto('/app/settings');
    await expect(page.getByTestId('route-organizer-login')).toBeVisible();
    await expect(page).toHaveURL(/\/app\/login\?redirectTo=%2Fapp%2Fsettings$/);

    // 2. Sign in as Organizer A (0 workspaces) -> lands on /app/settings (`No Active Workspace`), navigates to onboarding
    await page.getByLabel('Email address').fill(creds.ownerEmail);
    await page.getByLabel('Password', { exact: true }).fill(creds.password);
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('settings-no-workspace-card')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('link', { name: 'Go to workspace onboarding' }).click();
    await expect(page.getByTestId('workspace-onboarding-card')).toBeVisible();

    // 3. Update profile display name (`P1-AC02`)
    await page.getByLabel('Display name').fill(`Owner ${projectShort}`);
    await page.getByTestId('profile-save-button').click();
    await expect(page.getByTestId('profile-saved-notice')).toBeVisible();

    // 4. Create first workspace (`wsAlphaName`) -> activates automatically (`P1-AC03`, `P1-AC08`)
    await page.getByLabel('Workspace name').fill(wsAlphaName);
    await page.getByTestId('create-workspace-submit-button').click();
    await expect(page.getByTestId('active-workspace-heading')).toHaveText(wsAlphaName);
    await expect(page.getByTestId('active-workspace-role-badge')).toHaveText('Role: Owner');

    // 5. Create second workspace (`wsBetaName`) and verify reload persistence (`P1-AC08`)
    await page.getByTestId('toggle-create-workspace-button').click();
    await page.getByLabel('Workspace name').fill(wsBetaName);
    await page.getByTestId('create-workspace-submit-button').click();
    await expect(page.getByTestId('active-workspace-heading')).toHaveText(wsBetaName);

    await page.reload();
    await expect(page.getByTestId('active-workspace-heading')).toHaveText(wsBetaName);

    // 6. Open Workspace Settings on `wsBetaName`:
    //    - Verify sole-owner leave button is disabled
    //    - Verify unregistered email returns `ORGANIZER_NOT_REGISTERED`
    //    - Add Viewer & Editor co-organizers and verify Owner sees all co-member emails (`P1-AC15`)
    await page.getByTestId('go-to-workspace-settings-link').click();
    await expect(page.getByTestId('route-organizer-settings')).toBeVisible();
    await expect(page.getByTestId('sole-owner-badge')).toBeVisible();
    await expect(page.getByTestId('leave-workspace-button')).toBeDisabled();

    expectingNegativeRpcRejection = true;
    await page.getByLabel('Organizer email').fill(`missing.${creds.runTag}@example.com`);
    await page.getByTestId('add-member-submit-button').click();
    await expect(page.getByTestId('add-member-error')).toContainText(
      'No registered organizer account matches that email yet',
    );
    expectingNegativeRpcRejection = false;

    await page.getByLabel('Organizer email').fill(creds.viewerEmail);
    await page.getByTestId('add-member-role-select').selectOption('viewer');
    await page.getByTestId('add-member-submit-button').click();
    await expect(page.getByTestId('add-member-success')).toContainText(creds.viewerEmail);

    await page.getByLabel('Organizer email').fill(creds.editorEmail);
    await page.getByTestId('add-member-role-select').selectOption('editor');
    await page.getByTestId('add-member-submit-button').click();
    await expect(page.getByTestId('add-member-success')).toContainText(creds.editorEmail);

    await expect(page.getByTestId('workspace-member-list')).toContainText(creds.viewerEmail);
    await expect(page.getByTestId('workspace-member-list')).toContainText(creds.editorEmail);

    // 7. Sign out Organizer A and sign in as Organizer B (`Viewer`) in the same browser (`P1-AC07`)
    await page.getByTestId('organizer-signout-button').click();
    await expect(page.getByTestId('route-organizer-login')).toBeVisible();

    await page.getByLabel('Email address').fill(creds.viewerEmail);
    await page.getByLabel('Password', { exact: true }).fill(creds.password);
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('active-workspace-heading')).toHaveText(wsBetaName);
    await expect(page.getByTestId('active-workspace-role-badge')).toHaveText('Role: Viewer');

    // 8. Verify Viewer RBAC & PostgreSQL co-member email masking (`P1-AC05`, `P1-AC15`)
    await page.getByTestId('go-to-workspace-settings-link').click();
    await expect(page.getByTestId('route-organizer-settings')).toBeVisible();
    await expect(page.getByLabel('Workspace name')).toBeDisabled();
    await expect(page.getByTestId('workspace-settings-save-button')).toHaveCount(0);
    await expect(page.getByTestId('add-member-submit-button')).toHaveCount(0);
    await expect(page.getByTestId('delete-workspace-button')).toHaveCount(0);

    // Viewer sees own email, while Owner & Editor emails are masked (`null` from PostgreSQL)
    await expect(page.getByTestId('workspace-member-list')).toContainText(creds.viewerEmail);
    await expect(page.getByTestId('member-email-masked')).toHaveCount(2);
    await expect(page.locator('body')).not.toContainText(creds.ownerEmail);
    await expect(page.locator('body')).not.toContainText(creds.editorEmail);

    // 9. Viewer leaves `wsBetaName` voluntarily -> returns to 0-workspace onboarding (`P1-AC05`)
    await page.getByTestId('leave-workspace-button').click();
    await expect(page.getByTestId('workspace-onboarding-card')).toBeVisible();

    // 10. Public guest routes remain completely unaffected (`P1-AC06`, `P1-AC14`)
    const guestProbeToken = `guest-live-probe-${projectShort}-${creds.runTag}`;
    await page.goto(`/i/${guestProbeToken}`);
    await expect(page.getByTestId('public-shell')).toBeVisible();
    await expect(page.getByTestId('route-public-invitation')).toBeVisible();
    expect(await page.content()).not.toContain(guestProbeToken);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
