import { describe, expect, it } from 'vitest';
import { sanitizeOrganizerRedirect } from '@/features/auth/schemas/authSchemas';
import {
  nullableHttpsUrlSchema,
  parseInvitationDocument,
} from '@/features/design/schemas/designSchemas';
import { isValidPublicInvitationToken } from '@/features/guests/schemas/publicInvitationSchemas';

describe('Cross-Feature Open-Redirect, URL Protocol & Token Security Invariants (P9-AC08, P9-AC10)', () => {
  it('blocks open-redirect payloads, protocol-relative URLs, backslashes, auth loops, and guest routes', () => {
    const blockedTargets = [
      'https://evil.example.com/phish',
      'http://evil.example.com',
      '//evil.example.com/app',
      '///evil.example.com',
      '/\\evil.example.com',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '/app/login',
      '/app/signup',
      '/app/forgot-password',
      '/app/reset-password',
      '/w/some-public-wedding',
      '/i/some-secret-token',
      '/app/weddings\u0000/123',
    ];

    for (const target of blockedTargets) {
      expect(sanitizeOrganizerRedirect(target)).toBe('/app');
    }

    expect(
      sanitizeOrganizerRedirect('/app/weddings/11111111-2222-4333-8444-555555555555/rsvps?tab=all'),
    ).toBe('/app/weddings/11111111-2222-4333-8444-555555555555/rsvps?tab=all');
  });

  it('rejects javascript:, data:, vbscript:, and insecure http:// URLs across invitation schemas', () => {
    const unsafeUrls = [
      'javascript:alert(document.cookie)',
      'JAVASCRIPT:alert(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
      'http://insecure.example.com/map',
    ];

    for (const unsafeUrl of unsafeUrls) {
      expect(nullableHttpsUrlSchema.safeParse(unsafeUrl).success).toBe(false);
    }

    expect(nullableHttpsUrlSchema.safeParse('https://maps.example.com/venue').success).toBe(true);
    expect(nullableHttpsUrlSchema.safeParse('').data ?? null).toBeNull();
  });

  it('rejects script/URI injection payloads and unknown properties inside InvitationDocument', () => {
    const maliciousDoc = {
      schemaVersion: 1,
      wedding: {
        title: 'Clara <script>alert(1)</script>',
        slug: 'clara-mateo',
        partnerOneName: 'Clara',
        partnerTwoName: 'Mateo',
        eventDate: '2027-10-12',
        venueName: 'Conservatory',
        venueLocation: 'Manila',
        timezone: 'Asia/Manila',
        isRsvpOpen: true,
        rsvpDeadline: null,
      },
      theme: {
        schemaVersion: 1,
        presetId: 'editorial_ivory',
        tokenOverrides: {},
      },
      sections: [],
    };

    const result = parseInvitationDocument(maliciousDoc);
    expect(result.ok).toBe(false);
  });

  it('enforces strict 32..128 URL-safe base64url bounds on public invitation tokens', () => {
    expect(isValidPublicInvitationToken(undefined)).toBe(false);
    expect(isValidPublicInvitationToken('short-token')).toBe(false);
    expect(isValidPublicInvitationToken('<img src=x onerror=alert(1)>0000000000000000')).toBe(
      false,
    );
    expect(isValidPublicInvitationToken('A'.repeat(129))).toBe(false);
    expect(isValidPublicInvitationToken('guest_link_sample_111111111111111111111111')).toBe(true);
  });
});
