import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InvitationRenderer } from '@/features/design/components/InvitationRenderer';
import { createStarterInvitationDocument } from '@/features/design/registry/sectionRegistry';
import {
  DESIGN_SCHEMA_VERSION,
  type InvitationDocument,
  parseInvitationDocument,
} from '@/features/design/schemas/designSchemas';
import { resolveInvitationTheme } from '@/features/design/themes/themePresets';

describe('Invitation Design System, Zod Validation & <InvitationRenderer /> (P3-AC06, P3-AC07)', () => {
  it('renders two materially distinct wedding configurations cleanly through one <InvitationRenderer /> across desktop and mobile viewports', () => {
    // Configuration A: Editorial Ivory church celebration in Manila with Dress Code hidden & FAQ hidden
    const weddingA = createStarterInvitationDocument({
      presetId: 'editorial_ivory',
      wedding: {
        title: "Elena & Mateo's Wedding",
        partnerOneName: 'Elena',
        partnerTwoName: 'Mateo',
        slug: 'elena-mateo-manila',
        eventDate: '2027-06-19',
        venueName: 'San Agustin Church',
        venueLocation: 'Intramuros, Manila',
        timezone: 'Asia/Manila',
        rsvpDeadline: '2027-05-15T15:59:00.000Z',
        isRsvpOpen: true,
      },
    });

    // Configuration B: Celestial Midnight black-tie evening gala in New York with split hero, custom overrides, Dress Code + FAQ visible, and RSVP closed
    const baseB = createStarterInvitationDocument({
      presetId: 'celestial_midnight',
      dressCode: 'Black Tie Optional',
      wedding: {
        title: 'Clara & Julian Evening Gala',
        partnerOneName: 'Clara',
        partnerTwoName: 'Julian',
        slug: 'clara-julian-nyc',
        eventDate: '2027-11-06',
        venueName: 'The Pier Sixty Loft',
        venueLocation: 'New York, NY',
        timezone: 'America/New_York',
        rsvpDeadline: '2027-10-01T22:00:00.000Z',
        isRsvpOpen: false,
      },
    });

    const weddingB: InvitationDocument = {
      ...baseB,
      theme: {
        schemaVersion: DESIGN_SCHEMA_VERSION,
        presetId: 'celestial_midnight',
        tokenOverrides: {
          primaryAccentHex: '#D4AF37',
          cornerStyle: 'arch',
          ornamentStyle: 'monogram_crest',
        },
      },
      sections: baseB.sections.map((section) => {
        if (section.sectionType === 'hero') {
          return {
            ...section,
            content: {
              ...section.content,
              alignment: 'split' as const,
              coupleHeadline: 'Clara & Julian — Midnight in Manhattan',
            },
          };
        }
        if (section.sectionType === 'faq_notes') {
          return { ...section, isVisible: true };
        }
        if (section.sectionType === 'venue_travel') {
          return {
            ...section,
            content: {
              ...section.content,
              mapUrl: 'https://maps.example.com/pier-sixty',
              accommodations: [
                {
                  name: 'The High Line Hotel',
                  note: 'Mention the Clara & Julian room block.',
                  bookingUrl: 'https://hotel.example.com/block',
                },
              ],
            },
          };
        }
        return section;
      }),
    };

    const { unmount } = render(<InvitationRenderer document={weddingA} viewportMode="desktop" />);

    expect(screen.getByTestId('invitation-viewport-frame')).toHaveAttribute(
      'data-viewport-mode',
      'desktop',
    );
    expect(screen.getByTestId('invitation-renderer')).toHaveAttribute(
      'data-theme-preset',
      'editorial_ivory',
    );
    expect(screen.getByTestId('invitation-renderer')).toHaveAttribute('data-dark-surface', 'false');
    expect(screen.getByTestId('invitation-hero-headline')).toHaveTextContent('Elena & Mateo');
    expect(screen.getByTestId('invitation-section-our_story')).toBeInTheDocument();
    expect(screen.getByTestId('invitation-section-event_schedule')).toBeInTheDocument();
    expect(screen.queryByTestId('invitation-section-dress_code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invitation-section-faq_notes')).not.toBeInTheDocument();
    expect(screen.getByText(/Kindly respond by .*11:59 PM \(Asia\/Manila\)/)).toBeInTheDocument();

    unmount();

    render(<InvitationRenderer document={weddingB} viewportMode="mobile" />);

    expect(screen.getByTestId('invitation-viewport-frame')).toHaveAttribute(
      'data-viewport-mode',
      'mobile',
    );
    expect(screen.getByTestId('invitation-renderer')).toHaveAttribute(
      'data-theme-preset',
      'celestial_midnight',
    );
    expect(screen.getByTestId('invitation-renderer')).toHaveAttribute('data-dark-surface', 'true');
    expect(screen.getByTestId('invitation-hero-headline')).toHaveTextContent(
      'Clara & Julian — Midnight in Manhattan',
    );
    expect(screen.getByTestId('invitation-section-dress_code')).toHaveTextContent(
      'Black Tie Optional',
    );
    expect(screen.getByTestId('invitation-section-faq_notes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open venue map/i })).toHaveAttribute(
      'href',
      'https://maps.example.com/pier-sixty',
    );
    expect(screen.getByText('Online RSVP is currently closed')).toBeInTheDocument();
  });

  it('rejects unknown strictObject keys, mismatched section payloads, javascript:/http: URLs, script tags, and invalid hex overrides', () => {
    const validDoc = createStarterInvitationDocument({
      wedding: {
        title: 'Ava & Liam',
        partnerOneName: 'Ava',
        partnerTwoName: 'Liam',
        slug: 'ava-liam',
        eventDate: null,
        venueName: '',
        venueLocation: '',
        timezone: 'UTC',
        rsvpDeadline: null,
        isRsvpOpen: true,
      },
    });

    // 1. Unknown key inside `tokenOverrides` (`z.strictObject`)
    const withUnknownToken = {
      ...validDoc,
      theme: {
        ...validDoc.theme,
        tokenOverrides: { injectedCss: 'url(https://evil.example)' },
      },
    };
    expect(parseInvitationDocument(withUnknownToken).ok).toBe(false);

    // 2. Non-hex CSS injection inside `primaryAccentHex`
    const withBadHex = {
      ...validDoc,
      theme: {
        ...validDoc.theme,
        tokenOverrides: { primaryAccentHex: 'red; background: url(x)' },
      },
    };
    expect(parseInvitationDocument(withBadHex).ok).toBe(false);

    // 3. `javascript:` or insecure `http://` URL inside `venue_travel.mapUrl`
    const withJsUrl = {
      ...validDoc,
      sections: validDoc.sections.map((s) =>
        s.sectionType === 'venue_travel'
          ? { ...s, content: { ...s.content, mapUrl: 'javascript:alert(1)' } }
          : s,
      ),
    };
    expect(parseInvitationDocument(withJsUrl).ok).toBe(false);

    const withHttpUrl = {
      ...validDoc,
      sections: validDoc.sections.map((s) =>
        s.sectionType === 'venue_travel'
          ? { ...s, content: { ...s.content, mapUrl: 'http://insecure.example.com' } }
          : s,
      ),
    };
    expect(parseInvitationDocument(withHttpUrl).ok).toBe(false);

    // 4. `<script>` tag inside narrative copy
    const withScriptTag = {
      ...validDoc,
      sections: validDoc.sections.map((s) =>
        s.sectionType === 'our_story'
          ? { ...s, content: { ...s.content, narrative: 'Hello <script>evil()</script>' } }
          : s,
      ),
    };
    expect(parseInvitationDocument(withScriptTag).ok).toBe(false);

    // 5. `<InvitationRenderer />` renders safe structured error alert instead of crashing or executing untrusted payloads
    render(<InvitationRenderer document={withJsUrl} />);
    expect(screen.getByTestId('invitation-schema-invalid')).toBeInTheDocument();
    expect(screen.queryByTestId('invitation-renderer')).not.toBeInTheDocument();
  });

  it('computes readable contrast tokens when custom primaryAccentHex overrides are supplied', () => {
    const lightAccent = resolveInvitationTheme({
      schemaVersion: 1,
      presetId: 'celestial_midnight',
      tokenOverrides: { primaryAccentHex: '#F5E6C8' },
    });
    expect(lightAccent.accentContrastHex).toBe('#1A1A1A');

    const darkAccent = resolveInvitationTheme({
      schemaVersion: 1,
      presetId: 'editorial_ivory',
      tokenOverrides: { primaryAccentHex: '#2B3A2E' },
    });
    expect(darkAccent.accentContrastHex).toBe('#FFFFFF');
  });
});
