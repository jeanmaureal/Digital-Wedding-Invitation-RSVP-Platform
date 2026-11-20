import { expect, test } from '@playwright/test';

test.describe('Phase 0 & Phase 1 Portal Route Shells & Auth Guards (P0-AC01, P1-AC06, P1-AC14)', () => {
  test('verifies public routes remain auth-free while /app and /app/settings enforce login redirects cleanly', async ({
    page,
  }) => {
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

    // 1. Public Home (/)
    await page.goto('/');
    await expect(page.getByTestId('public-shell')).toBeVisible();
    await expect(page.getByTestId('route-public-home')).toBeVisible();

    // 2. Organizer Portal (/app) -> unauthenticated redirect to /app/login + reload
    await page.goto('/app');
    await expect(page.getByTestId('organizer-shell')).toBeVisible();
    await expect(page.getByTestId('route-organizer-login')).toBeVisible();
    await expect(page).toHaveURL(/\/app\/login$/);
    await page.reload();
    await expect(page.getByTestId('route-organizer-login')).toBeVisible();

    // 3. Protected Settings (/app/settings) & Wedding Detail (/app/weddings/:weddingId) -> preserve allowlisted redirectTo
    await page.goto('/app/settings');
    await expect(page.getByTestId('route-organizer-login')).toBeVisible();
    await expect(page).toHaveURL(/\/app\/login\?redirectTo=%2Fapp%2Fsettings$/);

    await page.goto('/app/weddings/11111111-2222-4333-8444-555555555555');
    await expect(page.getByTestId('route-organizer-login')).toBeVisible();
    await expect(page).toHaveURL(
      /\/app\/login\?redirectTo=%2Fapp%2Fweddings%2F11111111-2222-4333-8444-555555555555$/,
    );

    await page.goto('/app/weddings/11111111-2222-4333-8444-555555555555/guests');
    await expect(page.getByTestId('route-organizer-login')).toBeVisible();
    await expect(page).toHaveURL(
      /\/app\/login\?redirectTo=%2Fapp%2Fweddings%2F11111111-2222-4333-8444-555555555555%2Fguests$/,
    );

    await page.goto('/app/weddings/11111111-2222-4333-8444-555555555555/rsvps');
    await expect(page.getByTestId('route-organizer-login')).toBeVisible();
    await expect(page).toHaveURL(
      /\/app\/login\?redirectTo=%2Fapp%2Fweddings%2F11111111-2222-4333-8444-555555555555%2Frsvps$/,
    );

    // 4. Auth sub-routes (/app/signup, /app/forgot-password, /app/reset-password)
    await page.goto('/app/signup');
    await expect(page.getByTestId('route-organizer-signup')).toBeVisible();

    await page.goto('/app/forgot-password');
    await expect(page.getByTestId('route-organizer-forgot-password')).toBeVisible();

    await page.goto('/app/reset-password');
    await expect(page.getByTestId('route-organizer-reset-password')).toBeVisible();

    // 5. Public Wedding Shell (/w/test) + malformed slug check (unaffected by organizer auth)
    await page.goto('/w/test');
    await expect(page.getByTestId('public-shell')).toBeVisible();
    await expect(page.getByTestId('route-public-wedding')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Invitation Not Yet Available' })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('route-public-wedding')).toBeVisible();

    await page.goto('/w/INVALID_SLUG_VALUE');
    await expect(page.getByRole('heading', { name: 'Invalid Wedding Link' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('INVALID_SLUG_VALUE');

    // 6. Guest Invitation Shell (/i/:token) — verify token is never echoed and no auth redirect occurs
    const probeToken = 'test-secret-guest-token-probe-7741';
    await page.goto(`/i/${probeToken}`);
    await expect(page.getByTestId('public-shell')).toBeVisible();
    await expect(page.getByTestId('route-public-invitation')).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain(probeToken);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
