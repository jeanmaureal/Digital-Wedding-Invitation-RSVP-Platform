import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';

interface Phase9LiveCredentials {
  readonly tenantAEmail: string;
  readonly tenantBEmail: string;
  readonly password: string;
  readonly runTag: string;
}

function getCredentialsForProject(projectName: string): Phase9LiveCredentials {
  const prefix = projectName === 'chromium-mobile' ? 'P9_E2E_MOBILE' : 'P9_E2E_DESKTOP';
  return {
    tenantAEmail: process.env[`${prefix}_TENANT_A_EMAIL`] ?? '',
    tenantBEmail: process.env[`${prefix}_TENANT_B_EMAIL`] ?? '',
    password: process.env.P9_E2E_PASSWORD ?? '',
    runTag: process.env.P9_E2E_RUN_TAG ?? 'p9e2e',
  };
}

test.describe('Phase 9 Live 3-Context Cross-Tenant Security, Stored-XSS & Token Lifecycle E2E (P9-AC12)', () => {
  test.skip(
    process.env.P9_LIVE_E2E !== '1',
    'Live Phase 9 E2E runs via `npm run test:e2e:phase9:live` (`P9_LIVE_E2E=1`).',
  );

  test('enforces fail-closed cross-tenant deep-link blocking across all 4 wedding routes, invite_only public gating, stored-XSS & CSV formula neutralization, and instant token revocation', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(150_000);

    const isMobile = testInfo.project.name === 'chromium-mobile';
    const creds = getCredentialsForProject(testInfo.project.name);
    const shortTag = `${isMobile ? 'mob' : 'dsk'}-${creds.runTag}`;
    const workspaceAName = `Alpha Confidential Studio ${shortTag}`;
    const workspaceBName = `Bravo Outsider Studio ${shortTag}`;
    const privateSlug = `elena-mateo-priv-${shortTag}`;
    const secretVenueName = `Chateau Confidential ${shortTag}`;
    const xssDietaryPayload = '<img src=x onerror="window.__p9_xss=1"> Nut-free';
    const formulaAnswerPayload = '=HYPERLINK("https://evil.example","Click")';
    const xssHouseholdNote = '<svg onload="window.__p9_xss=2"> Excited to celebrate!';

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[tenant-a] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      pageErrors.push(`[tenant-a] ${err.message}`);
    });

    const outsiderContext = await browser.newContext();
    const outsiderPage = await outsiderContext.newPage();
    outsiderPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[outsider] ${msg.text()}`);
    });
    outsiderPage.on('pageerror', (err) => {
      pageErrors.push(`[outsider] ${err.message}`);
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
      // 1. Tenant A signs in, creates Workspace A, creates an `invite_only` wedding, and publishes v1
      await page.goto('/app/login');
      await page.getByLabel('Email address').fill(creds.tenantAEmail);
      await page.getByLabel('Password', { exact: true }).fill(creds.password);
      await page.getByTestId('login-submit-button').click();

      await expect(page.getByTestId('workspace-onboarding-card')).toBeVisible({ timeout: 15_000 });
      await page.getByLabel('Workspace name').fill(workspaceAName);
      await page.getByTestId('create-workspace-submit-button').click();
      await expect(page.getByTestId('active-workspace-heading')).toHaveText(workspaceAName);

      await page.getByTestId('open-create-wedding-wizard-button').click();
      await page.getByLabel('Partner 1 name').fill('Elena');
      await page.getByLabel('Partner 2 name').fill('Mateo');
      await page.getByLabel(/Public URL slug/i).fill(privateSlug);
      await page.getByLabel(/Celebration date/i).fill('2027-11-14');
      await page.getByLabel(/Venue name/i).fill(secretVenueName);
      await page.getByTestId('wizard-next-step-button').click();
      await page.getByLabel('Wedding IANA timezone').selectOption('Asia/Manila');
      await page.getByLabel('Website access policy').selectOption('invite_only');
      await page.getByTestId('create-wedding-submit-button').click();

      await expect(page.getByTestId('wedding-publishing-card')).toBeVisible({ timeout: 15_000 });
      const weddingOverviewUrl = page.url();
      const tenantAWeddingId =
        weddingOverviewUrl.split('/app/weddings/')[1]?.split(/[/?#]/)[0] ?? '';
      expect(tenantAWeddingId.length).toBeGreaterThan(20);

      await page.getByTestId('publish-wedding-button').click();
      await expect(page.getByTestId('publishing-active-version-badge')).toContainText('v1', {
        timeout: 15_000,
      });

      // 2. Anonymous visitor probes `/w/:slug` -> blocked by `invite_only` gate with zero secret venue leakage
      await guestPage.goto(`/w/${privateSlug}`);
      await expect(guestPage.getByTestId('public-wedding-invite-only')).toBeVisible({
        timeout: 15_000,
      });
      expect(await guestPage.content()).not.toContain(secretVenueName);

      // 3. Tenant A creates a custom short_text RSVP question + household + guest + `/i/:token`
      await page.getByTestId('summary-open-rsvps-link').click();
      await expect(page.getByTestId('route-organizer-wedding-rsvps')).toBeVisible({
        timeout: 15_000,
      });

      await page.getByTestId('open-create-rsvp-question-button').click();
      await page.getByTestId('rsvp-question-label-input').fill('Toast Note');
      await page.getByTestId('rsvp-question-type-select').selectOption('short_text');
      await page.getByTestId('save-rsvp-question-button').click();
      await expect(page.getByTestId('rsvp-questions-manager-card')).toContainText('Toast Note');

      await page.getByTestId('rsvps-open-guests-link').click();
      await expect(page.getByTestId('route-organizer-wedding-guests')).toBeVisible({
        timeout: 15_000,
      });

      await page.getByTestId('open-create-household-button').click();
      await page.getByTestId('household-display-name-input').fill('The Delgado Household');
      await page.getByTestId('household-max-attendees-input').fill('2');
      await page.getByTestId('save-household-button').click();

      const delgadoCard = page
        .locator('[data-testid^="household-card-"]')
        .filter({ hasText: 'The Delgado Household' });
      await expect(delgadoCard).toBeVisible({ timeout: 10_000 });

      await delgadoCard.locator('[data-testid^="add-guest-to-group-"]').click();
      await delgadoCard.getByTestId('guest-first-name-input').fill('Sofia');
      await delgadoCard.getByTestId('guest-last-name-input').fill('Delgado');
      await delgadoCard.getByTestId('save-guest-button').click();
      await expect(delgadoCard).toContainText('Sofia Delgado');

      await delgadoCard.locator('[data-testid^="issue-invitation-"]').click();
      await expect(page.getByTestId('issued-invitation-qr-card')).toBeVisible({ timeout: 10_000 });
      const fullInvitationUrl = await page.getByTestId('issued-invitation-url-input').inputValue();
      const tokenPath = new URL(fullInvitationUrl).pathname;
      const rawToken = tokenPath.replace('/i/', '');
      await page.getByTestId('dismiss-issued-qr-button').click();

      // 4. Guest unlocks private invitation via `/i/:token` and submits stored-XSS + formula-injection probes
      await guestPage.goto(tokenPath);
      await expect(guestPage.getByTestId('public-invitation-household-card')).toBeVisible({
        timeout: 15_000,
      });

      const sofiaRow = guestPage
        .locator('[data-testid^="rsvp-member-row-"]')
        .filter({ hasText: 'Sofia Delgado' });
      await sofiaRow.locator('[data-testid^="rsvp-guest-dietary-"]').fill(xssDietaryPayload);
      await guestPage
        .locator('[data-testid^="rsvp-question-input-"]')
        .nth(0)
        .fill(formulaAnswerPayload);
      await guestPage.getByTestId('rsvp-household-note-input').fill(xssHouseholdNote);
      await guestPage.getByTestId('rsvp-submit-button').click();

      await expect(guestPage.getByTestId('public-rsvp-confirmed-summary')).toContainText(
        'Confirmed Attending (1 guest)',
        { timeout: 15_000 },
      );
      expect(await guestPage.content()).not.toContain(rawToken);
      expect(
        await guestPage.evaluate(() => (globalThis as unknown as { __p9_xss?: unknown }).__p9_xss),
      ).toBeUndefined();

      // 5. Tenant B Outsider signs in, creates Workspace B, and probes all 4 Tenant A wedding deep links
      await outsiderPage.goto('/app/login');
      await outsiderPage.getByLabel('Email address').fill(creds.tenantBEmail);
      await outsiderPage.getByLabel('Password', { exact: true }).fill(creds.password);
      await outsiderPage.getByTestId('login-submit-button').click();

      await expect(outsiderPage.getByTestId('workspace-onboarding-card')).toBeVisible({
        timeout: 15_000,
      });
      await outsiderPage.getByLabel('Workspace name').fill(workspaceBName);
      await outsiderPage.getByTestId('create-workspace-submit-button').click();
      await expect(outsiderPage.getByTestId('active-workspace-heading')).toHaveText(workspaceBName);

      const protectedDeepLinks: readonly {
        readonly path: string;
        readonly mismatchTestId: string;
      }[] = [
        {
          path: `/app/weddings/${tenantAWeddingId}`,
          mismatchTestId: 'wedding-workspace-mismatch-card',
        },
        {
          path: `/app/weddings/${tenantAWeddingId}/builder`,
          mismatchTestId: 'wedding-builder-workspace-mismatch-card',
        },
        {
          path: `/app/weddings/${tenantAWeddingId}/guests`,
          mismatchTestId: 'guests-workspace-mismatch-card',
        },
        {
          path: `/app/weddings/${tenantAWeddingId}/rsvps`,
          mismatchTestId: 'rsvps-workspace-mismatch-card',
        },
      ];

      for (const target of protectedDeepLinks) {
        await outsiderPage.goto(target.path);
        await expect(outsiderPage.getByTestId(target.mismatchTestId)).toBeVisible({
          timeout: 15_000,
        });
        const outsiderDom = await outsiderPage.content();
        expect(outsiderDom).not.toContain(secretVenueName);
        expect(outsiderDom).not.toContain(privateSlug);
        expect(outsiderDom).not.toContain('The Delgado Household');
        expect(outsiderDom).not.toContain('Sofia Delgado');
        expect(outsiderDom).not.toContain(xssHouseholdNote);
      }

      // 6. Tenant A views `/rsvps` -> verifies stored-XSS strings render inertly (`window.__p9_xss === undefined`)
      //    and exported CSV neutralizes `=HYPERLINK(...)` while omitting tokens!
      await page.goto(`/app/weddings/${tenantAWeddingId}/rsvps`);
      await expect(page.getByTestId('wedding-rsvp-analytics-card')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId('route-organizer-wedding-rsvps')).toContainText(
        xssDietaryPayload,
      );
      await expect(page.getByTestId('route-organizer-wedding-rsvps')).toContainText(
        xssHouseholdNote,
      );

      const organizerXssFired = await page.evaluate(
        () => (globalThis as unknown as { __p9_xss?: unknown }).__p9_xss,
      );
      expect(organizerXssFired).toBeUndefined();

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('export-rsvp-attendance-csv-button').click();
      const download = await downloadPromise;
      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      const csvRaw = await fs.readFile(downloadPath!, 'utf8');

      expect(csvRaw.startsWith('\uFEFF')).toBe(true);
      expect(csvRaw).toContain('"\'=HYPERLINK(""https://evil.example"",""Click"")"');
      expect(csvRaw).not.toContain(rawToken);
      expect(csvRaw.toLowerCase()).not.toContain('token_hash');

      // 7. Tenant A revokes the household's token on `/guests` -> Guest reload on `/i/:token` fails closed immediately
      await page.getByTestId('rsvps-open-guests-link').click();
      await expect(delgadoCard).toBeVisible({ timeout: 15_000 });
      await delgadoCard.locator('[data-testid^="revoke-invitation-"]').click();
      await expect(delgadoCard.locator('[data-testid^="inv-status-"]')).toHaveText(
        'No Active Link',
        { timeout: 10_000 },
      );

      await guestPage.reload();
      await expect(guestPage.getByTestId('public-invitation-unavailable')).toBeVisible({
        timeout: 15_000,
      });
      const revokedDom = await guestPage.content();
      expect(revokedDom).not.toContain(rawToken);
      expect(revokedDom).not.toContain('The Delgado Household');
      expect(revokedDom).not.toContain('Sofia Delgado');

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await outsiderContext.close();
      await guestContext.close();
    }
  });
});
