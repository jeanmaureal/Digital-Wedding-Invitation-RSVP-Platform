import { expect, test } from '@playwright/test';

test.describe('Phase 0 Portal Route Shells (P0-AC01)', () => {
  test('loads /, /app, /w/test, and /i/test with expected shells, deep-link reload, and zero errors', async ({
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

    // 2. Organizer Portal (/app) + direct reload
    await page.goto('/app');
    await expect(page.getByTestId('organizer-shell')).toBeVisible();
    await expect(page.getByTestId('route-organizer-root')).toBeVisible();
    const statusText = await page.getByTestId('supabase-status-badge').textContent();
    if (statusText?.includes('configured') && !statusText.includes('unconfigured')) {
      await expect(page.getByTestId('supabase-rpc-status')).toContainText('ok (');
    }
    await page.reload();
    await expect(page.getByTestId('route-organizer-root')).toBeVisible();

    // 3. Public Wedding Shell (/w/test) + malformed slug check
    await page.goto('/w/test');
    await expect(page.getByTestId('public-shell')).toBeVisible();
    await expect(page.getByTestId('route-public-wedding')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Invitation Not Yet Available' })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('route-public-wedding')).toBeVisible();

    await page.goto('/w/INVALID_SLUG_VALUE');
    await expect(page.getByRole('heading', { name: 'Invalid Wedding Link' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('INVALID_SLUG_VALUE');

    // 4. Guest Invitation Shell (/i/:token) — verify token is never echoed
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
