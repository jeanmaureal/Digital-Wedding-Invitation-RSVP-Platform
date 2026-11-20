import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { WeddingInvitationBuilder } from '@/features/design/components/builder/WeddingInvitationBuilder';
import { createStarterInvitationDocument } from '@/features/design/registry/sectionRegistry';
import type { InvitationDocument } from '@/features/design/schemas/designSchemas';
import type { WeddingRecord, WeddingSettingsRecord } from '@/features/weddings/api/weddingApi';
import type { WorkspaceRole } from '@/features/workspace/schemas/workspaceSchemas';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WEDDING_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

function makeWeddingFixture(): {
  readonly wedding: WeddingRecord;
  readonly settings: WeddingSettingsRecord;
  readonly document: InvitationDocument;
} {
  const wedding: WeddingRecord = {
    id: WEDDING_ID,
    workspace_id: WORKSPACE_ID,
    title: 'Elena & Mateo Celebration',
    slug: 'elena-mateo-2027',
    partner_one_name: 'Elena',
    partner_two_name: 'Mateo',
    event_date: '2027-06-19',
    venue_name: 'Villa Aurelia',
    venue_location: 'Tagaytay Highlands',
    status: 'draft',
    archived_at: null,
    duplicated_from_wedding_id: null,
    created_by: USER_ID,
    created_at: '2026-11-19T00:00:00.000Z',
    updated_at: '2026-11-19T00:00:00.000Z',
  };

  const settings: WeddingSettingsRecord = {
    wedding_id: WEDDING_ID,
    workspace_id: WORKSPACE_ID,
    timezone: 'Asia/Manila',
    rsvp_deadline: '2027-05-20T15:59:00.000Z',
    is_rsvp_open: true,
    access_mode: 'public',
    allow_plus_ones_default: false,
    show_guest_dietary_notes: true,
    primary_locale: 'en',
    contact_email: 'couple@example.com',
    dress_code: 'Garden Formal',
    rsvp_confirmation_message: 'Thank you for celebrating with us!',
    created_at: '2026-11-19T00:00:00.000Z',
    updated_at: '2026-11-19T00:00:00.000Z',
  };

  const starter = createStarterInvitationDocument({
    presetId: 'editorial_ivory',
    dressCode: settings.dress_code,
    wedding: {
      title: wedding.title,
      partnerOneName: wedding.partner_one_name,
      partnerTwoName: wedding.partner_two_name,
      slug: wedding.slug,
      eventDate: wedding.event_date,
      venueName: wedding.venue_name,
      venueLocation: wedding.venue_location,
      timezone: settings.timezone,
      rsvpDeadline: settings.rsvp_deadline,
      isRsvpOpen: settings.is_rsvp_open,
    },
  });

  const document: InvitationDocument = {
    ...starter,
    sections: starter.sections.map((sec, idx) => ({
      ...sec,
      id: `00000000-0000-4000-8000-00000000000${idx + 1}`,
    })),
  };

  return { wedding, settings, document };
}

function createMockSupabaseDesignClient() {
  const themeUpdates: Array<Record<string, unknown>> = [];
  const sectionUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const reorderCalls: Array<Record<string, unknown>> = [];

  const fromMock = vi.fn((table: string) => {
    if (table === 'wedding_themes') {
      return {
        update: (payload: Record<string, unknown>) => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => {
                  themeUpdates.push(payload);
                  return {
                    data: {
                      wedding_id: WEDDING_ID,
                      workspace_id: WORKSPACE_ID,
                      preset_id: payload.preset_id,
                      schema_version: 1,
                      token_overrides: payload.token_overrides,
                      created_at: '2026-11-19T00:00:00.000Z',
                      updated_at: '2026-11-19T01:00:00.000Z',
                    },
                    error: null,
                  };
                },
              }),
            }),
          }),
        }),
      };
    }

    if (table === 'wedding_sections') {
      return {
        update: (payload: Record<string, unknown>) => ({
          eq: () => ({
            eq: () => ({
              eq: (_col: string, sectionId: string) => ({
                select: () => ({
                  maybeSingle: async () => {
                    sectionUpdates.push({ id: sectionId, payload });
                    return {
                      data: {
                        id: sectionId,
                        wedding_id: WEDDING_ID,
                        workspace_id: WORKSPACE_ID,
                        section_type: 'hero',
                        sort_order: 0,
                        is_visible: payload.is_visible,
                        schema_version: 1,
                        content: payload.content,
                        created_at: '2026-11-19T00:00:00.000Z',
                        updated_at: '2026-11-19T01:00:00.000Z',
                      },
                      error: null,
                    };
                  },
                }),
              }),
            }),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  const rpcMock = vi.fn(async (fnName: string, args: Record<string, unknown>) => {
    if (fnName !== 'reorder_wedding_sections') {
      throw new Error(`Unexpected RPC ${fnName}`);
    }
    reorderCalls.push(args);
    const ids = args.p_ordered_section_ids as string[];
    return {
      data: ids.map((id, idx) => ({
        id,
        wedding_id: WEDDING_ID,
        workspace_id: WORKSPACE_ID,
        section_type: 'hero',
        sort_order: idx,
        is_visible: true,
        schema_version: 1,
        content: {},
        created_at: '2026-11-19T00:00:00.000Z',
        updated_at: '2026-11-19T01:00:00.000Z',
      })),
      error: null,
    };
  });

  const uploadedAssets: Array<{ path: string; contentType: string }> = [];
  const storageMock = {
    from: vi.fn((bucket: string) => ({
      upload: vi.fn(async (path: string, _file: File, options?: { contentType?: string }) => {
        uploadedAssets.push({ path, contentType: options?.contentType ?? '' });
        return { data: { path }, error: null };
      }),
      getPublicUrl: vi.fn((path: string) => ({
        data: {
          publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}`,
        },
      })),
    })),
  };

  return {
    client: {
      from: fromMock,
      rpc: rpcMock,
      storage: storageMock,
    } as unknown as TypedSupabaseClient,
    themeUpdates,
    sectionUpdates,
    reorderCalls,
    uploadedAssets,
  };
}

function renderBuilder(params: {
  readonly callerRole?: WorkspaceRole | undefined;
  readonly debounceMs?: number | undefined;
}) {
  const fixture = makeWeddingFixture();
  const mockApi = createMockSupabaseDesignClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/app/weddings/${WEDDING_ID}/builder`]}>
        <WeddingInvitationBuilder
          userId={USER_ID}
          workspaceId={WORKSPACE_ID}
          callerRole={params.callerRole ?? 'owner'}
          wedding={fixture.wedding}
          settings={fixture.settings}
          initialDocument={fixture.document}
          debounceMs={params.debounceMs ?? 45}
          client={mockApi.client}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...view, fixture, mockApi };
}

describe('WeddingInvitationBuilder — Live Preview, Editors, Tokens, Reordering & Debounced Autosave (Gate 3)', () => {
  it('updates live <InvitationRenderer /> immediately, preserves input focus across debounced autosave, and flushes across multiple sections (P4-AC03, P4-AC06)', async () => {
    const user = userEvent.setup();
    const { mockApi } = renderBuilder({ debounceMs: 50 });

    const headlineInput = screen.getByTestId('hero-couple-headline-input');
    await user.clear(headlineInput);
    await user.type(headlineInput, 'Elena & Mateo — Tagaytay Sunset');

    // Live preview reflects edit immediately before debounce fires
    expect(screen.getByTestId('invitation-hero-headline')).toHaveTextContent(
      'Elena & Mateo — Tagaytay Sunset',
    );
    expect(document.activeElement).toBe(headlineInput);

    // Wait for debounced autosave to complete while focus stays on the input
    await waitFor(() => {
      expect(mockApi.sectionUpdates.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('builder-autosave-status')).toHaveAttribute(
        'data-autosave-state',
        'saved',
      );
    });
    expect(document.activeElement).toBe(headlineInput);

    // Switch to Our Story -> append a milestone -> switch to RSVP Banner -> edit button label
    await user.click(screen.getByTestId('select-section-our_story'));
    await user.click(screen.getByTestId('story-add-milestone-button'));
    expect(screen.getByTestId('story-milestone-item-2')).toBeInTheDocument();

    await user.click(screen.getByTestId('select-section-rsvp_banner'));
    const rsvpBtnInput = screen.getByTestId('rsvp-banner-button-label-input');
    await user.clear(rsvpBtnInput);
    await user.type(rsvpBtnInput, 'Confirm Household Seat');

    await waitFor(() => {
      expect(screen.getByTestId('builder-autosave-status')).toHaveAttribute(
        'data-autosave-state',
        'saved',
      );
    });

    const savedButtonLabels = mockApi.sectionUpdates.map(
      (u) => (u.payload.content as Record<string, unknown>).buttonLabel,
    );
    expect(savedButtonLabels).toContain('Confirm Household Seat');
  });

  it('blocks invalid http:// URLs, <script> strings, and malformed hex colors before any Supabase write (P4-AC06)', async () => {
    const user = userEvent.setup();
    const { mockApi } = renderBuilder({ debounceMs: 40 });

    await user.click(screen.getByTestId('select-section-venue_travel'));
    const mapUrlInput = screen.getByTestId('venue-map-url-input');
    await user.type(mapUrlInput, 'http://insecure.example.com/venue');

    expect(await screen.findByTestId('builder-validation-banner')).toHaveTextContent(
      /External links must use https:\/\//i,
    );
    expect(document.getElementById('venue-map-url-error')).toHaveTextContent(
      /External links must use https:\/\//i,
    );
    expect(screen.getByTestId('builder-autosave-status')).toHaveAttribute(
      'data-autosave-state',
      'validation_error',
    );

    // Wait well past debounce window — zero DB writes must occur for http:// URL
    await new Promise((resolve) => setTimeout(resolve, 90));
    expect(mockApi.sectionUpdates).toHaveLength(0);

    // Also test <script> payload rejection before DB write
    const ceremonyInput = screen.getByTestId('venue-ceremony-name-input');
    await user.clear(mapUrlInput);
    await user.type(ceremonyInput, '<script>alert(1)</script>');
    expect(screen.getByTestId('builder-autosave-status')).toHaveAttribute(
      'data-autosave-state',
      'validation_error',
    );
    await new Promise((resolve) => setTimeout(resolve, 90));
    expect(
      mockApi.sectionUpdates.some((u) =>
        JSON.stringify(u.payload).toLowerCase().includes('<script'),
      ),
    ).toBe(false);

    // Fix ceremony name and URL to valid https:// -> saves cleanly
    await user.clear(ceremonyInput);
    await user.type(ceremonyInput, 'Villa Aurelia Chapel');
    await user.type(mapUrlInput, 'https://maps.example.com/villa-aurelia');

    await waitFor(() => {
      const latestContent = mockApi.sectionUpdates[mockApi.sectionUpdates.length - 1]?.payload
        .content as Record<string, unknown> | undefined;
      expect(latestContent?.mapUrl).toBe('https://maps.example.com/villa-aurelia');
      expect(latestContent?.ceremonyVenueName).toBe('Villa Aurelia Chapel');
      expect(screen.getByTestId('builder-autosave-status')).toHaveAttribute(
        'data-autosave-state',
        'saved',
      );
    });
    expect(mockApi.sectionUpdates.some((u) => JSON.stringify(u.payload).includes('http://'))).toBe(
      false,
    );
    expect(screen.getByRole('link', { name: /Open Venue Map/i })).toHaveAttribute(
      'href',
      'https://maps.example.com/villa-aurelia',
    );

    // Switch to Theme & Tokens -> enter malformed hex color -> zero theme writes
    await user.click(screen.getByTestId('inspector-tab-theme'));
    const accentInput = screen.getByTestId('theme-accent-hex-input');
    await user.type(accentInput, '#ZZZZZZ');

    expect(await screen.findByTestId('builder-validation-banner')).toHaveTextContent(
      /6-digit hex code/i,
    );
    expect(document.getElementById('theme-accent-hex-error')).toHaveTextContent(
      /6-digit hex code/i,
    );
    expect(screen.getByTestId('builder-autosave-status')).toHaveAttribute(
      'data-autosave-state',
      'validation_error',
    );
    await new Promise((resolve) => setTimeout(resolve, 90));
    expect(mockApi.themeUpdates).toHaveLength(0);
  });

  it('applies theme presets and custom token overrides to live CSS variables and persists cleanly (P4-AC04)', async () => {
    const user = userEvent.setup();
    const { mockApi } = renderBuilder({ debounceMs: 40 });

    await user.click(screen.getByTestId('inspector-tab-theme'));
    await user.click(screen.getByTestId('builder-theme-preset-terracotta_atelier'));

    await waitFor(() => {
      expect(screen.getByTestId('invitation-renderer')).toHaveAttribute(
        'data-theme-preset',
        'terracotta_atelier',
      );
      expect(mockApi.themeUpdates.length).toBe(1);
    });

    await user.click(screen.getByTestId('theme-accent-swatch-8C3B2B'));
    await user.selectOptions(screen.getByTestId('theme-corner-style-select'), 'arch');
    await user.selectOptions(
      screen.getByTestId('theme-ornament-style-select'),
      'botanical_flourish',
    );

    await waitFor(() => {
      expect(screen.getByTestId('builder-autosave-status')).toHaveAttribute(
        'data-autosave-state',
        'saved',
      );
    });

    const rendererStyle = screen.getByTestId('invitation-renderer').getAttribute('style') ?? '';
    expect(rendererStyle).toContain('--inv-accent: #8C3B2B');
    expect(rendererStyle).toContain('--inv-radius: 1.5rem');

    // Reset overrides restores empty tokenOverrides
    await user.click(screen.getByTestId('reset-theme-overrides-button'));
    await waitFor(() => {
      const latest = mockApi.themeUpdates[mockApi.themeUpdates.length - 1];
      expect(latest?.token_overrides).toEqual({});
    });
  });

  it('reorders sections via reorder_wedding_sections RPC and prevents hiding the last visible section (P4-AC05)', async () => {
    const user = userEvent.setup();
    const { mockApi } = renderBuilder({ debounceMs: 40 });

    // Move Our Story (index 1) down -> swaps with Order of Events (index 2)
    await user.click(screen.getByTestId('move-section-down-our_story'));

    await waitFor(() => {
      expect(mockApi.reorderCalls).toHaveLength(1);
    });

    const previewStage = screen.getByTestId('builder-live-preview-stage');
    const renderedSections = within(previewStage).getAllByTestId(/^invitation-section-/);
    expect(renderedSections[0]).toHaveAttribute('data-testid', 'invitation-section-hero');
    expect(renderedSections[1]).toHaveAttribute('data-testid', 'invitation-section-event_schedule');
    expect(renderedSections[2]).toHaveAttribute('data-testid', 'invitation-section-our_story');

    // Hide visible sections one by one until only 1 remains visible
    await user.click(screen.getByTestId('toggle-section-visibility-our_story'));
    await user.click(screen.getByTestId('toggle-section-visibility-event_schedule'));
    await user.click(screen.getByTestId('toggle-section-visibility-venue_travel'));
    await user.click(screen.getByTestId('toggle-section-visibility-dress_code'));
    await user.click(screen.getByTestId('toggle-section-visibility-rsvp_banner'));

    // Hero is now the sole remaining visible section -> its hide button must be disabled
    expect(screen.getByTestId('last-visible-section-note')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-section-visibility-hero')).toBeDisabled();
  });

  it('enforces strict read-only mode for workspace viewers with zero mutation calls (P4-AC08)', () => {
    const { mockApi } = renderBuilder({ callerRole: 'viewer' });

    expect(screen.getByTestId('builder-readonly-badge')).toHaveTextContent('Read-only (Viewer)');
    expect(screen.getByTestId('hero-couple-headline-input')).toBeDisabled();
    expect(screen.getByTestId('reset-section-starter-button')).toBeDisabled();
    expect(screen.getByTestId('toggle-section-visibility-hero')).toBeDisabled();
    expect(screen.getByTestId('move-section-down-hero')).toBeDisabled();

    expect(mockApi.sectionUpdates).toHaveLength(0);
    expect(mockApi.themeUpdates).toHaveLength(0);
    expect(mockApi.reorderCalls).toHaveLength(0);
  });

  it('supports non-destructive font library imports, per-section canvas colors/fonts/sizes, background picture with transparency slider, milestone photo upload/reorder/tiling, and venue same-location toggle', async () => {
    const user = userEvent.setup();
    const { mockApi } = renderBuilder({ debounceMs: 40 });

    // 1. Theme tab: import TWO .ttf fonts non-destructively into the permanent Font Library
    await user.click(screen.getByTestId('inspector-tab-theme'));

    const fontFileA = new File([new Uint8Array([0, 1, 0, 0])], 'Playfair-Display.ttf', {
      type: 'font/ttf',
    });
    const fontFileB = new File([new Uint8Array([0, 1, 0, 1])], 'GreatVibes-Regular.ttf', {
      type: 'font/ttf',
    });
    await user.upload(screen.getByTestId('theme-custom-font-file-input'), fontFileA);
    await waitFor(() => {
      expect(screen.getByTestId('theme-custom-font-name-input-0')).toHaveValue('Playfair Display');
    });

    await user.upload(screen.getByTestId('theme-custom-font-file-input'), fontFileB);
    await waitFor(() => {
      expect(screen.getByTestId('theme-custom-font-name-input-0')).toHaveValue('Playfair Display');
      expect(screen.getByTestId('theme-custom-font-name-input-1')).toHaveValue(
        'GreatVibes Regular',
      );
    });

    const bgFile = new File([new Uint8Array([255, 216, 255])], 'garden-bg.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(screen.getByTestId('theme-bg-image-file-input'), bgFile);

    await waitFor(() => {
      expect(screen.getByTestId('invitation-background-image')).toBeInTheDocument();
      expect(screen.getByTestId('theme-bg-opacity-slider')).toBeInTheDocument();
    });

    expect(mockApi.uploadedAssets.length).toBe(3);

    // 2. Per-section canvas styling: apply GreatVibes Regular + xl heading size + custom bg ONLY to Hero
    await user.click(screen.getByTestId('inspector-tab-sections'));
    await user.click(screen.getByTestId('select-section-hero'));
    await user.click(screen.getByTestId('section-style-toggle-hero'));

    const heroFontSelect = screen.getByTestId('section-heading-font-select-hero');
    const greatVibesOption = within(heroFontSelect).getByRole('option', {
      name: 'GreatVibes Regular',
    }) as HTMLOptionElement;
    await user.selectOptions(heroFontSelect, greatVibesOption.value);
    await user.selectOptions(screen.getByTestId('section-heading-size-select-hero'), 'xl');
    await user.type(screen.getByTestId('section-color-hero-backgroundBgHex'), '#1F2937');

    const previewStage = screen.getByTestId('builder-live-preview-stage');
    const heroWrapper = previewStage.querySelector('[data-section-type="hero"]');
    const storyWrapper = previewStage.querySelector('[data-section-type="our_story"]');
    expect(heroWrapper).toHaveAttribute('data-section-heading-scale', 'xl');
    expect(heroWrapper?.getAttribute('style') ?? '').toContain('--inv-canvas: #1F2937');
    expect(heroWrapper?.getAttribute('style') ?? '').toContain('InvCustomFont_');
    expect(storyWrapper).not.toHaveAttribute('data-section-heading-scale');
    expect(storyWrapper?.getAttribute('style') ?? '').not.toContain('InvCustomFont_');

    // 3. Our Story: upload 2 photos + reorder + change tile span
    await user.click(screen.getByTestId('select-section-our_story'));

    const photoA = new File([new Uint8Array([1, 2, 3])], 'first.jpg', { type: 'image/jpeg' });
    const photoB = new File([new Uint8Array([4, 5, 6])], 'second.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('story-milestone-upload-0'), [photoA, photoB]);

    await waitFor(() => {
      expect(screen.getByTestId('story-milestone-0-image-0')).toBeInTheDocument();
      expect(screen.getByTestId('story-milestone-0-image-1')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByTestId('story-milestone-0-img-span-0'), 'wide');
    expect(screen.getByTestId('milestone-image-tile-0')).toHaveAttribute('data-tile-span', 'wide');

    // Reorder photo 0 to the right -> photo 1 becomes first
    await user.click(screen.getByTestId('story-milestone-0-img-move-right-0'));
    expect(screen.getByTestId('milestone-image-tile-1')).toHaveAttribute('data-tile-span', 'wide');

    // 4. Venue & Travel: starts unified (same location), unchecking reveals Reception fields
    await user.click(screen.getByTestId('select-section-venue_travel'));
    expect(screen.getByTestId('venue-combined-card')).toBeInTheDocument();
    expect(screen.getByTestId('venue-same-location-checkbox')).toBeChecked();

    await user.click(screen.getByTestId('venue-same-location-checkbox'));
    expect(screen.getByTestId('venue-reception-name-input')).toBeInTheDocument();
    const receptionInput = screen.getByTestId('venue-reception-name-input');
    await user.clear(receptionInput);
    await user.type(receptionInput, 'Grand Pavilion');

    expect(screen.getByTestId('venue-ceremony-card')).toBeInTheDocument();
    expect(screen.getByTestId('venue-reception-card')).toHaveTextContent('Grand Pavilion');
  });
});
