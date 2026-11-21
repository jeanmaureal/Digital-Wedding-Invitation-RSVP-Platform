import { z } from 'zod';

/**
 * Versioned Invitation Design System Schemas (`P3-AC06`).
 *
 * Security & Purity Invariants (`docs/security-baseline.md` §3, `P3-AC09`):
 *   1. Zero imports from `organizerClient` or organizer-only modules — 100% safe for
 *      both Organizer Previews (Phases 3–4) and Public Snapshots (Phase 5).
 *   2. All object schemas use `z.strictObject(...)` so unknown/unexpected properties
 *      are deterministically rejected.
 *   3. All external links require `https://` (`javascript:`, `data:`, `vbscript:`, and
 *      `http://` are rejected), all color tokens require `/^#[0-9A-Fa-f]{6}$/`, and
 *      dangerous script tags/schemes are rejected at validation time.
 */

export const DESIGN_SCHEMA_VERSION = 1 as const;

export const WEDDING_THEME_PRESET_VALUES = [
  'editorial_ivory',
  'garden_sage',
  'celestial_midnight',
  'terracotta_atelier',
] as const;

export type WeddingThemePresetId = (typeof WEDDING_THEME_PRESET_VALUES)[number];

export const WEDDING_SECTION_TYPE_VALUES = [
  'hero',
  'our_story',
  'event_schedule',
  'venue_travel',
  'dress_code',
  'faq_notes',
  'rsvp_banner',
] as const;

export type WeddingSectionType = (typeof WEDDING_SECTION_TYPE_VALUES)[number];

export const weddingThemePresetSchema = z.enum(WEDDING_THEME_PRESET_VALUES);
export const weddingSectionTypeSchema = z.enum(WEDDING_SECTION_TYPE_VALUES);

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function containsForbiddenPayloadPattern(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes('<script') ||
    lower.includes('javascript:') ||
    lower.includes('vbscript:') ||
    lower.includes('data:text/html')
  );
}

function hasDisallowedControlChars(value: string, allowNewlines: boolean): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (allowNewlines && (code === 0x09 || code === 0x0a || code === 0x0d)) {
      continue;
    }
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function safeLineString(minLength: number, maxLength: number, fieldLabel: string) {
  return z
    .string()
    .trim()
    .min(minLength, `${fieldLabel} must be at least ${minLength} characters.`)
    .max(maxLength, `${fieldLabel} must be ${maxLength} characters or fewer.`)
    .refine(
      (val) => !hasDisallowedControlChars(val, false) && !containsForbiddenPayloadPattern(val),
      `${fieldLabel} contains unsupported control characters or unsafe markup.`,
    );
}

function safeOptionalLineString(maxLength: number, fieldLabel: string) {
  return z
    .string()
    .trim()
    .max(maxLength, `${fieldLabel} must be ${maxLength} characters or fewer.`)
    .refine(
      (val) => !hasDisallowedControlChars(val, false) && !containsForbiddenPayloadPattern(val),
      `${fieldLabel} contains unsupported control characters or unsafe markup.`,
    );
}

function safeMultilineString(minLength: number, maxLength: number, fieldLabel: string) {
  return z
    .string()
    .trim()
    .min(minLength, `${fieldLabel} must be at least ${minLength} characters.`)
    .max(maxLength, `${fieldLabel} must be ${maxLength} characters or fewer.`)
    .refine(
      (val) => !hasDisallowedControlChars(val, true) && !containsForbiddenPayloadPattern(val),
      `${fieldLabel} contains unsupported control characters or unsafe markup.`,
    );
}

export const hexColorSchema = z
  .string()
  .trim()
  .regex(HEX_COLOR_PATTERN, 'Color must be a 6-digit hex code such as #9A7B4F.')
  .transform((val) => val.toUpperCase());

export const httpsUrlSchema = z
  .string()
  .trim()
  .min(1, 'URL is required.')
  .superRefine((val, ctx) => {
    const lower = val.toLowerCase();
    if (
      val.length > 500 ||
      hasDisallowedControlChars(val, false) ||
      containsForbiddenPayloadPattern(val) ||
      lower.includes('url(') ||
      lower.includes('expression(')
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'URL is invalid or exceeds 500 characters.',
      });
      return;
    }
    try {
      const parsed = new URL(val);
      if (parsed.protocol !== 'https:') {
        ctx.addIssue({
          code: 'custom',
          message: 'Asset and external URLs must use https://.',
        });
      }
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a valid https:// URL.',
      });
    }
  });

export const nullableHttpsUrlSchema = z
  .union([z.string(), z.null()])
  .transform((val) => {
    if (val === null) {
      return null;
    }
    const trimmed = val.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  .superRefine((val, ctx) => {
    if (val === null) {
      return;
    }
    if (
      val.length > 500 ||
      hasDisallowedControlChars(val, false) ||
      containsForbiddenPayloadPattern(val)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'URL is invalid or exceeds 500 characters.',
      });
      return;
    }
    try {
      const parsed = new URL(val);
      if (parsed.protocol !== 'https:') {
        ctx.addIssue({
          code: 'custom',
          message: 'External links must use https://.',
        });
      }
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a valid https:// URL.',
      });
    }
  });

export const customFontAssetSchema = z.strictObject({
  id: safeLineString(1, 32, 'Font ID'),
  name: safeLineString(1, 60, 'Font name'),
  url: httpsUrlSchema,
});
export type CustomFontAsset = z.output<typeof customFontAssetSchema>;

export const sectionFontScaleSchema = z.enum(['xs', 'sm', 'md', 'lg', 'xl']);
export type SectionFontScale = z.output<typeof sectionFontScaleSchema>;

export const invitationAnimationStyleSchema = z.enum([
  'none',
  'gentle_fade',
  'editorial_rise',
  'romantic_float',
]);
export type InvitationAnimationStyle = z.output<typeof invitationAnimationStyleSchema>;

export const elementMotionStyleSchema = z.enum([
  'none',
  'fade',
  'rise',
  'slide_left',
  'slide_right',
  'zoom_soft',
  'float',
]);
export type ElementMotionStyle = z.output<typeof elementMotionStyleSchema>;

export const backgroundEffectSchema = z.enum([
  'none',
  'falling_leaves',
  'falling_petals',
  'sparkles',
]);
export type BackgroundEffectId = z.output<typeof backgroundEffectSchema>;

export const cardBorderStyleSchema = z.enum([
  'classic',
  'none',
  'double',
  'dashed',
  'gold_foil',
  'corner_accent',
]);
export type CardBorderStyleId = z.output<typeof cardBorderStyleSchema>;

export const sectionStyleOverridesSchema = z.strictObject({
  backgroundBgHex: hexColorSchema.optional(),
  surfaceBgHex: hexColorSchema.optional(),
  inkPrimaryHex: hexColorSchema.optional(),
  inkMutedHex: hexColorSchema.optional(),
  accentHex: hexColorSchema.optional(),
  cardOpacity: z.number().int().min(10).max(100).optional(),
  cardBorderStyle: cardBorderStyleSchema.optional(),
  textMotion: elementMotionStyleSchema.optional(),
  cardMotion: elementMotionStyleSchema.optional(),
  featureMotion: elementMotionStyleSchema.optional(),
  headingFont: safeLineString(1, 64, 'Section heading font').optional(),
  bodyFont: safeLineString(1, 64, 'Section body font').optional(),
  headingSize: sectionFontScaleSchema.optional(),
  bodySize: sectionFontScaleSchema.optional(),
});
export type SectionStyleOverrides = z.output<typeof sectionStyleOverridesSchema>;

export const themeTokenOverridesSchema = z.strictObject({
  primaryAccentHex: hexColorSchema.optional(),
  canvasBgHex: hexColorSchema.optional(),
  surfaceBgHex: hexColorSchema.optional(),
  surfaceMutedBgHex: hexColorSchema.optional(),
  inkPrimaryHex: hexColorSchema.optional(),
  inkMutedHex: hexColorSchema.optional(),
  borderColorHex: hexColorSchema.optional(),
  surfaceTint: z.enum(['default', 'warm', 'cool', 'high_contrast']).optional(),
  headingFontPair: z
    .enum([
      'editorial_serif',
      'classic_serif',
      'modern_sans',
      'romantic_serif',
      'handwritten_script',
      'minimal_mono',
    ])
    .optional(),
  bodyFontPair: z
    .enum(['modern_sans', 'editorial_serif', 'classic_serif', 'humanist_sans', 'minimal_mono'])
    .optional(),
  customFonts: z.array(customFontAssetSchema).max(8).optional(),
  headingCustomFontId: safeLineString(1, 32, 'Heading custom font ID').optional(),
  bodyCustomFontId: safeLineString(1, 32, 'Body custom font ID').optional(),
  // Legacy single-font fields retained for backward compatibility with saved drafts/snapshots
  customFontName: safeLineString(1, 60, 'Custom font name').optional(),
  customFontUrl: httpsUrlSchema.optional(),
  customFontTarget: z.enum(['heading', 'body', 'both']).optional(),
  backgroundImageUrl: httpsUrlSchema.optional(),
  backgroundOverlayOpacity: z.number().int().min(0).max(100).optional(),
  backgroundEffect: backgroundEffectSchema.optional(),
  cardOpacity: z.number().int().min(10).max(100).optional(),
  cardBorderStyle: cardBorderStyleSchema.optional(),
  animationStyle: invitationAnimationStyleSchema.optional(),
  cornerStyle: z.enum(['sharp', 'soft', 'arch']).optional(),
  sectionSpacing: z.enum(['compact', 'comfortable', 'airy']).optional(),
  ornamentStyle: z
    .enum(['minimal_line', 'botanical_flourish', 'monogram_crest', 'none'])
    .optional(),
});

export type ThemeTokenOverrides = z.output<typeof themeTokenOverridesSchema>;

export const weddingThemeConfigSchema = z.strictObject({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
  presetId: weddingThemePresetSchema,
  tokenOverrides: themeTokenOverridesSchema,
});

export type WeddingThemeConfig = z.output<typeof weddingThemeConfigSchema>;

// ---------------------------------------------------------------------------
// 7 Registered Section Content Schemas (`z.strictObject`)
// ---------------------------------------------------------------------------

export const heroSectionContentSchema = z.strictObject({
  eyebrow: safeOptionalLineString(80, 'Hero eyebrow'),
  coupleHeadline: safeLineString(1, 120, 'Couple headline'),
  celebrationSubtitle: safeOptionalLineString(160, 'Celebration subtitle'),
  displayDateLabel: safeOptionalLineString(80, 'Display date label'),
  locationSummary: safeOptionalLineString(120, 'Location summary'),
  primaryCtaLabel: safeLineString(1, 40, 'Primary button label'),
  showCountdownBadge: z.boolean(),
  alignment: z.enum(['center', 'split']),
  style: sectionStyleOverridesSchema.optional(),
});
export type HeroSectionContent = z.output<typeof heroSectionContentSchema>;

export const storyMilestoneImageTileSpanSchema = z.enum(['standard', 'wide', 'tall']);
export type StoryMilestoneImageTileSpan = z.output<typeof storyMilestoneImageTileSpanSchema>;

export const storyMilestoneImageLayoutSchema = z.enum([
  'grid_2',
  'grid_3',
  'featured_top',
  'custom_mosaic',
]);
export type StoryMilestoneImageLayout = z.output<typeof storyMilestoneImageLayoutSchema>;

export const storyMilestoneImageSchema = z.strictObject({
  id: safeLineString(1, 64, 'Image ID'),
  url: httpsUrlSchema,
  alt: safeOptionalLineString(120, 'Image caption'),
  tileSpan: storyMilestoneImageTileSpanSchema.optional(),
});
export type StoryMilestoneImage = z.output<typeof storyMilestoneImageSchema>;

export const storyMilestoneSchema = z.strictObject({
  periodLabel: safeOptionalLineString(40, 'Milestone label'),
  dateLabel: safeOptionalLineString(40, 'Milestone date').optional(),
  title: safeOptionalLineString(80, 'Milestone title'),
  description: safeMultilineString(0, 300, 'Milestone description'),
  images: z.array(storyMilestoneImageSchema).optional(),
  imageLayout: storyMilestoneImageLayoutSchema.optional(),
});
export type StoryMilestone = z.output<typeof storyMilestoneSchema>;

export const ourStorySectionContentSchema = z.strictObject({
  heading: safeLineString(1, 80, 'Story heading'),
  leadQuote: safeOptionalLineString(240, 'Lead quote'),
  narrative: safeMultilineString(0, 1500, 'Story narrative'),
  milestones: z.array(storyMilestoneSchema).max(24),
  style: sectionStyleOverridesSchema.optional(),
});
export type OurStorySectionContent = z.output<typeof ourStorySectionContentSchema>;

export const scheduleEventItemSchema = z.strictObject({
  timeLabel: safeLineString(1, 40, 'Event time'),
  title: safeLineString(1, 80, 'Event title'),
  venueName: safeOptionalLineString(120, 'Event venue'),
  address: safeOptionalLineString(160, 'Event address'),
  notes: safeOptionalLineString(240, 'Event notes'),
});

export const eventScheduleSectionContentSchema = z.strictObject({
  heading: safeLineString(1, 80, 'Schedule heading'),
  timezoneNote: safeOptionalLineString(120, 'Timezone note'),
  items: z.array(scheduleEventItemSchema).min(1).max(8),
  style: sectionStyleOverridesSchema.optional(),
});
export type EventScheduleSectionContent = z.output<typeof eventScheduleSectionContentSchema>;

export const accommodationItemSchema = z.strictObject({
  name: safeLineString(1, 80, 'Accommodation name'),
  note: safeOptionalLineString(200, 'Accommodation note'),
  bookingUrl: nullableHttpsUrlSchema,
});

export const venueTravelSectionContentSchema = z.strictObject({
  heading: safeLineString(1, 80, 'Venue heading'),
  sameLocation: z.boolean().optional(),
  ceremonyVenueName: safeOptionalLineString(120, 'Ceremony venue'),
  ceremonyAddress: safeOptionalLineString(160, 'Ceremony address'),
  receptionVenueName: safeOptionalLineString(120, 'Reception venue'),
  receptionAddress: safeOptionalLineString(160, 'Reception address'),
  directionsNote: safeMultilineString(0, 600, 'Directions note'),
  mapUrl: nullableHttpsUrlSchema,
  accommodations: z.array(accommodationItemSchema).max(4),
  style: sectionStyleOverridesSchema.optional(),
});
export type VenueTravelSectionContent = z.output<typeof venueTravelSectionContentSchema>;

export const dressCodeSectionContentSchema = z.strictObject({
  heading: safeLineString(1, 80, 'Dress code heading'),
  dressCodeTitle: safeLineString(1, 80, 'Dress code title'),
  guidance: safeMultilineString(0, 500, 'Dress code guidance'),
  swatchHexes: z.array(hexColorSchema).max(5),
  style: sectionStyleOverridesSchema.optional(),
});
export type DressCodeSectionContent = z.output<typeof dressCodeSectionContentSchema>;

export const faqItemSchema = z.strictObject({
  question: safeLineString(1, 140, 'FAQ question'),
  answer: safeMultilineString(1, 500, 'FAQ answer'),
});

export const faqNotesSectionContentSchema = z.strictObject({
  heading: safeLineString(1, 80, 'FAQ heading'),
  items: z.array(faqItemSchema).min(1).max(10),
  style: sectionStyleOverridesSchema.optional(),
});
export type FaqNotesSectionContent = z.output<typeof faqNotesSectionContentSchema>;

export const rsvpBannerSectionContentSchema = z.strictObject({
  heading: safeLineString(1, 80, 'RSVP heading'),
  message: safeMultilineString(1, 400, 'RSVP message'),
  buttonLabel: safeLineString(1, 40, 'RSVP button label'),
  showDeadline: z.boolean(),
  style: sectionStyleOverridesSchema.optional(),
});
export type RsvpBannerSectionContent = z.output<typeof rsvpBannerSectionContentSchema>;

// ---------------------------------------------------------------------------
// Discriminated Union of Registered Section Records & Full Document Schema
// ---------------------------------------------------------------------------

const baseSectionFields = {
  id: z.string().min(1),
  sortOrder: z.number().int().min(0).max(50),
  isVisible: z.boolean(),
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
};

export const invitationSectionSchema = z.discriminatedUnion('sectionType', [
  z.strictObject({
    ...baseSectionFields,
    sectionType: z.literal('hero'),
    content: heroSectionContentSchema,
  }),
  z.strictObject({
    ...baseSectionFields,
    sectionType: z.literal('our_story'),
    content: ourStorySectionContentSchema,
  }),
  z.strictObject({
    ...baseSectionFields,
    sectionType: z.literal('event_schedule'),
    content: eventScheduleSectionContentSchema,
  }),
  z.strictObject({
    ...baseSectionFields,
    sectionType: z.literal('venue_travel'),
    content: venueTravelSectionContentSchema,
  }),
  z.strictObject({
    ...baseSectionFields,
    sectionType: z.literal('dress_code'),
    content: dressCodeSectionContentSchema,
  }),
  z.strictObject({
    ...baseSectionFields,
    sectionType: z.literal('faq_notes'),
    content: faqNotesSectionContentSchema,
  }),
  z.strictObject({
    ...baseSectionFields,
    sectionType: z.literal('rsvp_banner'),
    content: rsvpBannerSectionContentSchema,
  }),
]);

export type InvitationSection = z.output<typeof invitationSectionSchema>;

export type SectionContentByType = {
  readonly hero: HeroSectionContent;
  readonly our_story: OurStorySectionContent;
  readonly event_schedule: EventScheduleSectionContent;
  readonly venue_travel: VenueTravelSectionContent;
  readonly dress_code: DressCodeSectionContent;
  readonly faq_notes: FaqNotesSectionContent;
  readonly rsvp_banner: RsvpBannerSectionContent;
};

export const invitationWeddingMetadataSchema = z.strictObject({
  title: safeLineString(2, 120, 'Wedding title'),
  partnerOneName: safeLineString(1, 80, 'Partner 1 name'),
  partnerTwoName: safeLineString(1, 80, 'Partner 2 name'),
  slug: safeLineString(3, 80, 'Wedding slug'),
  eventDate: z.string().nullable(),
  venueName: safeOptionalLineString(120, 'Venue name'),
  venueLocation: safeOptionalLineString(160, 'Venue location'),
  timezone: safeLineString(3, 80, 'Timezone'),
  rsvpDeadline: z.string().nullable(),
  isRsvpOpen: z.boolean(),
});

export type InvitationWeddingMetadata = z.output<typeof invitationWeddingMetadataSchema>;

export const invitationDocumentSchema = z.strictObject({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
  wedding: invitationWeddingMetadataSchema,
  theme: weddingThemeConfigSchema,
  sections: z.array(invitationSectionSchema).min(1).max(12),
});

export type InvitationDocument = z.output<typeof invitationDocumentSchema>;

export interface SchemaValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type SchemaValidationResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly issues: readonly SchemaValidationIssue[] };

export function parseInvitationDocument(raw: unknown): SchemaValidationResult<InvitationDocument> {
  const result = invitationDocumentSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.') || 'document',
      message: issue.message,
    })),
  };
}
