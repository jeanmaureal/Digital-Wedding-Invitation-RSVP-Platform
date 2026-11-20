import { fireEvent, render, screen } from '@testing-library/react';
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

  it('supports custom color themes, custom TrueType fonts, background pictures with dynamic transparency, auto-hiding story milestones with tiled photos, and unified same-location venues', () => {
    const baseDoc = createStarterInvitationDocument({
      presetId: 'editorial_ivory',
      wedding: {
        title: 'Sofia & Marco Wedding',
        partnerOneName: 'Sofia',
        partnerTwoName: 'Marco',
        slug: 'sofia-marco',
        eventDate: '2027-09-12',
        venueName: 'Villa del Lago',
        venueLocation: 'Lake Como, Italy',
        timezone: 'Europe/Rome',
        rsvpDeadline: null,
        isRsvpOpen: true,
      },
    });

    const customizedDoc: InvitationDocument = {
      ...baseDoc,
      theme: {
        schemaVersion: DESIGN_SCHEMA_VERSION,
        presetId: 'editorial_ivory',
        tokenOverrides: {
          primaryAccentHex: '#7A3E48',
          canvasBgHex: '#18141A',
          surfaceBgHex: '#241E27',
          inkPrimaryHex: '#F7F1E8',
          inkMutedHex: '#C8BFC9',
          borderColorHex: '#3B3240',
          headingFontPair: 'handwritten_script',
          bodyFontPair: 'humanist_sans',
          customFontName: 'Bespoke Script',
          customFontUrl: 'https://example.supabase.co/storage/v1/object/public/wedding-assets/font.ttf',
          customFontTarget: 'both',
          backgroundImageUrl:
            'https://example.supabase.co/storage/v1/object/public/wedding-assets/bg.jpg',
          backgroundOverlayOpacity: 40,
        },
      },
      sections: baseDoc.sections.map((section) => {
        if (section.sectionType === 'our_story') {
          return {
            ...section,
            content: {
              heading: 'Our Story',
              leadQuote: '',
              narrative: '',
              milestones: [
                {
                  periodLabel: 'First Trip',
                  dateLabel: '2022-06-14',
                  title: '',
                  description: 'A weekend by the coast.',
                  imageLayout: 'custom_mosaic' as const,
                  images: [
                    {
                      id: 'img-1',
                      url: 'https://example.supabase.co/storage/v1/object/public/wedding-assets/m1.jpg',
                      alt: 'Sunset pier',
                      tileSpan: 'wide' as const,
                    },
                    {
                      id: 'img-2',
                      url: 'https://example.supabase.co/storage/v1/object/public/wedding-assets/m2.jpg',
                      alt: '',
                      tileSpan: 'tall' as const,
                    },
                  ],
                },
                // Completely empty milestone should auto-hide
                {
                  periodLabel: '',
                  dateLabel: '',
                  title: '',
                  description: '',
                },
              ],
            },
          };
        }
        return section;
      }),
    };

    const { unmount } = render(<InvitationRenderer document={customizedDoc} />);

    const renderer = screen.getByTestId('invitation-renderer');
    expect(renderer).toHaveAttribute('data-dark-surface', 'true');
    expect(renderer).toHaveAttribute('data-has-background-image', 'true');
    const styleAttr = renderer.getAttribute('style') ?? '';
    expect(styleAttr).toContain('--inv-canvas: #18141A');
    expect(styleAttr).toContain('--inv-surface: #241E27');
    expect(styleAttr).toContain('--inv-ink: #F7F1E8');
    expect(styleAttr).toContain('InvCustomFont_');

    expect(screen.getByTestId('invitation-background-image')).toBeInTheDocument();
    expect(screen.getByTestId('invitation-background-overlay')).toHaveAttribute(
      'data-overlay-opacity',
      '40',
    );

    // Our Story: main invitation features ONLY ONE image + "Read Full Story & Photos" button
    expect(screen.getByTestId('our-story-featured-image')).toBeInTheDocument();
    expect(screen.queryByTestId('milestone-image-grid')).not.toBeInTheDocument();
    expect(screen.getByTestId('invitation-story-milestone-0')).toBeInTheDocument();
    expect(screen.queryByTestId('invitation-story-milestone-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('invitation-story-milestone-label-0')).toHaveTextContent('First Trip');
    expect(screen.getByTestId('invitation-story-milestone-date-0')).toHaveTextContent(
      'June 14, 2022',
    );
    expect(screen.queryByTestId('invitation-story-milestone-title-0')).not.toBeInTheDocument();

    // Clicking "Read Full Story & View All 2 Photos" opens the dedicated Story & Photos page
    fireEvent.click(screen.getByTestId('our-story-more-button'));
    expect(screen.getByTestId('our-story-dedicated-page')).toBeInTheDocument();
    expect(screen.getByTestId('milestone-image-grid')).toHaveAttribute(
      'data-image-layout',
      'custom_mosaic',
    );
    expect(screen.getByTestId('milestone-image-tile-0')).toHaveAttribute('data-tile-span', 'wide');
    expect(screen.getByTestId('milestone-image-tile-1')).toHaveAttribute('data-tile-span', 'tall');

    // Clicking "Back to Invitation" returns to the main invitation
    fireEvent.click(screen.getByTestId('our-story-back-button'));
    expect(screen.queryByTestId('our-story-dedicated-page')).not.toBeInTheDocument();

    // Venue & Travel: same ceremony & reception location renders as ONE unified card
    expect(screen.getByTestId('venue-combined-card')).toHaveTextContent('Ceremony & Reception');
    expect(screen.getByTestId('venue-combined-card')).toHaveTextContent('Villa del Lago');
    expect(screen.queryByTestId('venue-ceremony-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('venue-reception-card')).not.toBeInTheDocument();

    unmount();

    // Distinct ceremony & reception venues render as two separate cards
    const splitVenueDoc: InvitationDocument = {
      ...baseDoc,
      sections: baseDoc.sections.map((section) =>
        section.sectionType === 'venue_travel'
          ? {
              ...section,
              content: {
                ...section.content,
                sameLocation: false,
                ceremonyVenueName: 'St. Mark Chapel',
                ceremonyAddress: '100 Main St',
                receptionVenueName: 'Grand Ballroom',
                receptionAddress: '200 Harbor Ave',
              },
            }
          : section,
      ),
    };

    render(<InvitationRenderer document={splitVenueDoc} />);
    expect(screen.queryByTestId('venue-combined-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('venue-ceremony-card')).toHaveTextContent('St. Mark Chapel');
    expect(screen.getByTestId('venue-reception-card')).toHaveTextContent('Grand Ballroom');
  });
});
