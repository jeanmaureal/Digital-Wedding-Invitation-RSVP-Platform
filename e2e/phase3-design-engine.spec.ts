import { expect, test } from '@playwright/test';

interface Phase3ActorCredentials {
  readonly ownerEmail: string;
  readonly viewerEmail: string;
  readonly password: string;
  readonly runTag: string;
}

function getCredentialsForProject(projectName: string): Phase3ActorCredentials {
  const prefix = projectName === 'chromium-mobile' ? 'P3_E2E_MOBILE' : 'P3_E2E_DESKTOP';
  return {
    ownerEmail: process.env[`${prefix}_OWNER_EMAIL`] ?? '',
    viewerEmail: process.env[`${prefix}_VIEWER_EMAIL`] ?? '',
    password: process.env.P3_E2E_PASSWORD ?? '',
    runTag: process.env.P3_E2E_RUN_TAG ?? 'p3e2e',
  };
}

test.describe('Phase 3 Live Invitation Design System & <InvitationRenderer /> E2E', () => {
  test.skip(
    process.env.P3_LIVE_E2E !== '1',
    'Live Phase 3 design engine E2E runs via `npm run test:e2e:phase3:live` (`P3_LIVE_E2E=1`).',
  );

  test('renders two distinct weddings with two distinct themes through <InvitationRenderer />, persists theme switches across reload & duplication, and enforces viewer read-only RBAC', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);

    const creds = getCredentialsForProject(testInfo.project.name);
    const shortTag = `${testInfo.project.name === 'chromium-mobile' ? 'mob' : 'dsk'}-${creds.runTag}`;
    const workspaceName = `Design Studio ${shortTag}`;
    const slugA = `elena-mateo-${shortTag}`;
    const slugB = `clara-julian-${shortTag}`;

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

    // 1. Sign in as Owner -> create Workspace & add Viewer co-member
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

    // 2. Create Wedding A (`Editorial Ivory` default -> switch to `Botanical Garden Sage`, inspect Desktop + Mobile frames)
    await page.getByTestId('open-create-wedding-wizard-button').click();
    await page.getByLabel('Partner 1 name').fill('Elena');
    await page.getByLabel('Partner 2 name').fill('Mateo');
    await page.getByLabel(/Public URL slug/i).fill(slugA);
    await page.getByLabel(/Celebration date/i).fill('2027-06-19');
    await page.getByLabel(/Venue name/i).fill('Villa Botanica');
    await page.getByTestId('wizard-next-step-button').click();

    await page.getByLabel('Wedding IANA timezone').selectOption('Asia/Manila');
    await page.getByTestId('create-wedding-submit-button').click();

    await expect(page.getByTestId('wedding-design-preview-card')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('invitation-renderer')).toHaveAttribute(
      'data-theme-preset',
      'editorial_ivory',
    );
    await expect(page.getByTestId('invitation-hero-headline')).toHaveText('Elena & Mateo');

    // Switch Wedding A to `Botanical Garden Sage` & toggle Mobile viewport frame
    await page.getByTestId('theme-preset-option-garden_sage').click();
    await expect(page.getByTestId('wedding-theme-saved-notice')).toContainText(
      'Botanical Garden Sage',
    );
    await expect(page.getByTestId('invitation-renderer')).toHaveAttribute(
      'data-theme-preset',
      'garden_sage',
    );

    await page.getByTestId('preview-viewport-mobile-button').click();
    await expect(page.getByTestId('invitation-viewport-frame')).toHaveAttribute(
      'data-viewport-mode',
      'mobile',
    );

    // Reload -> verifies `garden_sage` persisted in `public.wedding_themes`
    await page.reload();
    await expect(page.getByTestId('invitation-renderer')).toHaveAttribute(
      'data-theme-preset',
      'garden_sage',
    );

    // 3. Duplicate Wedding A into Wedding B -> clones `garden_sage`, then switch Wedding B to `Celestial Midnight` (dark surface!)
    await page.getByTestId('detail-duplicate-wedding-button').click();
    const dupCard = page.getByTestId('duplicate-wedding-card');
    await dupCard.getByLabel('New project title').fill('Clara & Julian Midnight Gala');
    await dupCard.getByLabel('New public URL slug').fill(slugB);
    await dupCard.getByLabel('Partner 1 name').fill('Clara');
    await dupCard.getByLabel('Partner 2 name').fill('Julian');
    await dupCard.getByTestId('duplicate-wedding-submit-button').click();

    await expect(page.getByTestId('wedding-detail-heading')).toHaveText(
      'Clara & Julian Midnight Gala',
    );
    await expect(page.getByTestId('invitation-renderer')).toHaveAttribute(
      'data-theme-preset',
      'garden_sage',
    );
    await expect(page.getByTestId('invitation-hero-headline')).toHaveText('Clara & Julian');

    // Switch Wedding B to `Celestial Midnight` (`data-dark-surface="true"`)
    await page.getByTestId('theme-preset-option-celestial_midnight').click();
    await expect(page.getByTestId('wedding-theme-saved-notice')).toContainText(
      'Celestial Midnight',
    );
    await expect(page.getByTestId('invitation-renderer')).toHaveAttribute(
      'data-theme-preset',
      'celestial_midnight',
    );
    await expect(page.getByTestId('invitation-renderer')).toHaveAttribute(
      'data-dark-surface',
      'true',
    );

    // Confirm Wedding A remained independently on `garden_sage` (`Gate 3` multi-configuration independence!)
    await page.getByTestId('back-to-weddings-link').click();
    await page.getByTestId(`open-wedding-button-${slugA}`).click();
    await expect(page.getByTestId('invitation-renderer')).toHaveAttribute(
      'data-theme-preset',
      'garden_sage',
    );
    await expect(page.getByTestId('invitation-renderer')).toHaveAttribute(
      'data-dark-surface',
      'false',
    );

    // 4. Sign out Owner -> sign in as Viewer (`P3-AC04`, `P3-AC08`: sees live preview read-only, theme radio buttons disabled)
    await page.getByTestId('organizer-signout-button').click();
    await page.getByLabel('Email address').fill(creds.viewerEmail);
    await page.getByLabel('Password', { exact: true }).fill(creds.password);
    await page.getByTestId('login-submit-button').click();

    await page.getByTestId(`open-wedding-button-${slugB}`).click();
    await expect(page.getByTestId('wedding-design-readonly-badge')).toBeVisible();
    await expect(page.getByTestId('invitation-renderer')).toHaveAttribute(
      'data-theme-preset',
      'celestial_midnight',
    );
    await expect(page.getByTestId('theme-preset-option-editorial_ivory')).toBeDisabled();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
