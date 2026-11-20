import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { expect, test } from '@playwright/test';

interface VercelHeaderConfig {
  readonly headers?: readonly {
    readonly source: string;
    readonly headers: readonly { readonly key: string; readonly value: string }[];
  }[];
}

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function ensureDistBuilt(repoRoot: string): string {
  const distDir = path.join(repoRoot, 'dist');
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    execSync('npm run build', { cwd: repoRoot, stdio: 'inherit' });
  }
  return distDir;
}

async function startDistCspServer(repoRoot: string): Promise<{
  readonly origin: string;
  readonly expectedHeaders: ReadonlyMap<string, string>;
  readonly close: () => Promise<void>;
}> {
  const distDir = ensureDistBuilt(repoRoot);
  const vercelJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'),
  ) as VercelHeaderConfig;

  const globalHeaders = vercelJson.headers?.find((rule) => rule.source === '/(.*)')?.headers ?? [];
  const expectedHeaders = new Map(
    globalHeaders.map((entry) => [entry.key.toLowerCase(), entry.value]),
  );

  const server = http.createServer((req, res) => {
    for (const header of globalHeaders) {
      res.setHeader(header.key, header.value);
    }

    const reqPathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const normalizedRel = path.posix
      .normalize(reqPathname)
      .replace(/^(\.\.(\/|\\|$))+/, '')
      .replace(/^\/+/, '');

    let candidatePath = path.join(distDir, normalizedRel);
    if (
      !normalizedRel ||
      !fs.existsSync(candidatePath) ||
      fs.statSync(candidatePath).isDirectory()
    ) {
      candidatePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(candidatePath).toLowerCase();
    res.setHeader('Content-Type', MIME_BY_EXT[ext] ?? 'application/octet-stream');
    res.writeHead(200);
    res.end(fs.readFileSync(candidatePath));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    expectedHeaders,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

test.describe('Phase 9 Always-On CI Security, Verbatim CSP & Route-Resilience Suite (P9-AC06..08, P9-AC11)', () => {
  test('serves production dist/ bundle with verbatim vercel.json CSP & HSTS headers with zero CSP violations across routes', async ({
    page,
  }) => {
    const serverHandle = await startDistCspServer(process.cwd());
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    await page.addInitScript(() => {
      interface BrowserCspGlobal {
        __cspViolations?: string[];
        document: {
          addEventListener: (
            type: string,
            listener: (event: { effectiveDirective: string; blockedURI: string }) => void,
          ) => void;
        };
      }
      const g = globalThis as unknown as BrowserCspGlobal;
      g.__cspViolations = [];
      g.document.addEventListener('securitypolicyviolation', (event) => {
        g.__cspViolations?.push(`${event.effectiveDirective}:${event.blockedURI}`);
      });
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    try {
      const homeResponse = await page.goto(`${serverHandle.origin}/`);
      expect(homeResponse).not.toBeNull();
      const responseHeaders = homeResponse?.headers() ?? {};

      for (const [headerKey, expectedVal] of serverHandle.expectedHeaders.entries()) {
        expect(responseHeaders[headerKey]).toBe(expectedVal);
      }

      await expect(page.getByTestId('public-shell')).toBeVisible();
      await expect(page.getByTestId('route-public-home')).toBeVisible();

      const routesToVerify: readonly { readonly path: string; readonly testId: string }[] = [
        { path: '/w/sample-celebration', testId: 'route-public-wedding' },
        {
          path: '/i/guest-link-probe-1111111111111111111111111111',
          testId: 'route-public-invitation',
        },
        { path: '/app/login', testId: 'route-organizer-login' },
        { path: '/app/signup', testId: 'route-organizer-signup' },
        { path: '/app/forgot-password', testId: 'route-organizer-forgot-password' },
        { path: '/unknown-deep-route-404', testId: 'public-shell' },
      ];

      for (const entry of routesToVerify) {
        await page.goto(`${serverHandle.origin}${entry.path}`);
        await expect(page.getByTestId(entry.testId)).toBeVisible();

        const violations = await page.evaluate(
          () => (globalThis as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
        );
        expect(violations).toEqual([]);
      }

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await serverHandle.close();
    }
  });

  test('neutralizes open-redirect query payloads on /app/login and enforces zero token echo & zero organizer auth storage on public routes', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const hostileRedirects = [
      '//evil.example.com/phish',
      'https://evil.example.com/phish',
      'javascript:alert(1)',
      '/\\evil.example.com',
      '/w/guest-route',
    ];

    for (const payload of hostileRedirects) {
      await page.goto(`/app/login?redirectTo=${encodeURIComponent(payload)}`);
      await expect(page.getByTestId('route-organizer-login')).toBeVisible();
      const signupHref = await page
        .getByRole('link', { name: 'Create an account' })
        .getAttribute('href');
      expect(signupHref).toBe('/app/signup');
    }

    // Valid internal organizer path IS preserved safely
    await page.goto('/app/login?redirectTo=%2Fapp%2Fsettings');
    await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/app/signup?redirectTo=%2Fapp%2Fsettings',
    );

    // Public `/i/:token` probes never echo token into DOM/title/storage and never create organizer auth storage
    const guestLinkProbe = 'guest-link-probe-2222222222222222222222222222';
    await page.goto(`/i/${guestLinkProbe}`);
    await expect(page.getByTestId('route-public-invitation')).toBeVisible();

    const domHtml = await page.content();
    const pageTitle = await page.title();
    const storageDump = await page.evaluate(() => {
      interface BrowserStorageGlobal {
        localStorage: { getItem: (itemName: string) => string | null };
        sessionStorage: Record<string, unknown>;
      }
      const g = globalThis as unknown as BrowserStorageGlobal;
      return {
        local: JSON.stringify(g.localStorage),
        session: JSON.stringify(g.sessionStorage),
        organizerAuthKey: g.localStorage.getItem('wedding_platform:organizer_auth:v1'),
      };
    });

    expect(domHtml).not.toContain(guestLinkProbe);
    expect(pageTitle).not.toContain(guestLinkProbe);
    expect(storageDump.local).not.toContain(guestLinkProbe);
    expect(storageDump.session).not.toContain(guestLinkProbe);
    expect(storageDump.organizerAuthKey).toBeNull();

    // XSS-shaped URL parameter on `/i/:token` never executes script
    await page.goto('/i/%3Cimg%20src%3Dx%20onerror%3Dwindow.__ci_xss%3D1%3E01234567890123456789');
    await expect(page.getByTestId('route-public-invitation')).toBeVisible();
    const xssFired = await page.evaluate(
      () => (globalThis as unknown as { __ci_xss?: unknown }).__ci_xss,
    );
    expect(xssFired).toBeUndefined();
    expect(consoleErrors).toEqual([]);
  });
});
