import type { JSX } from 'react';
import { DressCodeSection } from '@/features/design/components/sections/DressCodeSection';
import { EventScheduleSection } from '@/features/design/components/sections/EventScheduleSection';
import { FaqNotesSection } from '@/features/design/components/sections/FaqNotesSection';
import { HeroSection } from '@/features/design/components/sections/HeroSection';
import { OurStorySection } from '@/features/design/components/sections/OurStorySection';
import { RsvpBannerSection } from '@/features/design/components/sections/RsvpBannerSection';
import { VenueTravelSection } from '@/features/design/components/sections/VenueTravelSection';
import {
  DESIGN_SCHEMA_VERSION,
  dressCodeSectionContentSchema,
  eventScheduleSectionContentSchema,
  faqNotesSectionContentSchema,
  heroSectionContentSchema,
  type InvitationDocument,
  type InvitationSection,
  type InvitationWeddingMetadata,
  ourStorySectionContentSchema,
  rsvpBannerSectionContentSchema,
  type SectionContentByType,
  venueTravelSectionContentSchema,
  type WeddingSectionType,
  type WeddingThemePresetId,
} from '@/features/design/schemas/designSchemas';
import type { OrnamentStyleId } from '@/features/design/themes/themePresets';
import type { z } from 'zod';

export interface SectionRegistryEntry<K extends WeddingSectionType = WeddingSectionType> {
  readonly type: K;
  readonly label: string;
  readonly description: string;
  readonly schema: z.ZodType<SectionContentByType[K]>;
  readonly createStarterContent: (
    wedding: InvitationWeddingMetadata,
    dressCode?: string,
  ) => SectionContentByType[K];
}

export const SECTION_REGISTRY: {
  readonly [K in WeddingSectionType]: SectionRegistryEntry<K>;
} = {
  hero: {
    type: 'hero',
    label: 'Hero Cover',
    description:
      'Couple headline, celebration date, location badge, and primary RSVP call-to-action.',
    schema: heroSectionContentSchema,
    createStarterContent: (wedding) => ({
      eyebrow: 'Together with their families',
      coupleHeadline: `${wedding.partnerOneName} & ${wedding.partnerTwoName}`,
      celebrationSubtitle: 'Joyfully invite you to celebrate their wedding',
      displayDateLabel: '',
      locationSummary: wedding.venueLocation || wedding.venueName,
      primaryCtaLabel: 'Respond to Invitation',
      showCountdownBadge: true,
      alignment: 'center',
    }),
  },
  our_story: {
    type: 'our_story',
    label: 'Our Story',
    description: 'Editorial narrative and milestone moments from your relationship.',
    schema: ourStorySectionContentSchema,
    createStarterContent: () => ({
      heading: 'Our Story',
      leadQuote: 'Every chapter brought us closer to this day.',
      narrative:
        'We are so grateful to gather with our dearest family and friends as we begin this next chapter together.',
      milestones: [
        {
          periodLabel: 'First Chapter',
          title: 'Where It All Began',
          description: 'A conversation that turned into years of shared adventures.',
        },
        {
          periodLabel: 'The Proposal',
          title: 'A Joyful Yes',
          description: 'Surrounded by love and looking ahead to forever.',
        },
      ],
    }),
  },
  event_schedule: {
    type: 'event_schedule',
    label: 'Order of Events',
    description: 'Chronological timeline of ceremony, cocktails, reception, and farewell events.',
    schema: eventScheduleSectionContentSchema,
    createStarterContent: (wedding) => ({
      heading: 'Order of Events',
      timezoneNote: 'All times are shown in the celebration timezone.',
      items: [
        {
          timeLabel: '4:00 PM',
          title: 'Wedding Ceremony',
          venueName: wedding.venueName || 'Ceremony Venue',
          address: wedding.venueLocation,
          notes: 'Please arrive 20 minutes early to be seated.',
        },
        {
          timeLabel: '6:00 PM',
          title: 'Dinner & Reception',
          venueName: wedding.venueName || 'Reception Pavilion',
          address: wedding.venueLocation,
          notes: 'Cocktails, dinner, and dancing to follow.',
        },
      ],
    }),
  },
  venue_travel: {
    type: 'venue_travel',
    label: 'Venue & Travel',
    description: 'Ceremony and reception addresses, directions, map link, and hotel notes.',
    schema: venueTravelSectionContentSchema,
    createStarterContent: (wedding) => ({
      heading: 'Venue & Travel',
      ceremonyVenueName: wedding.venueName,
      ceremonyAddress: wedding.venueLocation,
      receptionVenueName: wedding.venueName,
      receptionAddress: wedding.venueLocation,
      directionsNote:
        'Complimentary guest parking and drop-off access will be available at the main entrance.',
      mapUrl: null,
      accommodations: [],
    }),
  },
  dress_code: {
    type: 'dress_code',
    label: 'Attire & Palette',
    description: 'Dress code guidance and suggested guest color swatches.',
    schema: dressCodeSectionContentSchema,
    createStarterContent: (_wedding, dressCode = '') => ({
      heading: 'Attire & Palette',
      dressCodeTitle: dressCode.trim() || 'Formal Celebration Attire',
      guidance: 'We invite guests to dress comfortably for an evening of celebration.',
      swatchHexes: ['#C8B6A6', '#8D7B68', '#4A403A'],
    }),
  },
  faq_notes: {
    type: 'faq_notes',
    label: 'Questions & Guest Notes',
    description: 'Helpful answers for guests regarding RSVPs, arrival, and policies.',
    schema: faqNotesSectionContentSchema,
    createStarterContent: () => ({
      heading: 'Questions & Guest Notes',
      items: [
        {
          question: 'When should I submit my RSVP?',
          answer: 'Kindly respond before the RSVP deadline listed on your invitation.',
        },
        {
          question: 'Can I bring an additional guest?',
          answer: 'Attendance is reserved for the guests named on your household invitation.',
        },
      ],
    }),
  },
  rsvp_banner: {
    type: 'rsvp_banner',
    label: 'RSVP Call to Action',
    description: 'Closing RSVP prompt displaying the celebration deadline in the wedding timezone.',
    schema: rsvpBannerSectionContentSchema,
    createStarterContent: () => ({
      heading: 'Kindly Respond',
      message:
        'Please use your personal household invitation link to confirm attendance and share any dietary notes.',
      buttonLabel: 'Respond to Invitation',
      showDeadline: true,
    }),
  },
};

export interface RenderRegisteredSectionParams {
  readonly section: InvitationSection;
  readonly wedding: InvitationWeddingMetadata;
  readonly ornamentStyle: OrnamentStyleId;
  readonly onPrimaryAction?: (() => void) | undefined;
  readonly onOpenFullStory?: (() => void) | undefined;
}

export function renderRegisteredSection({
  section,
  wedding,
  ornamentStyle,
  onPrimaryAction,
  onOpenFullStory,
}: RenderRegisteredSectionParams): JSX.Element {
  switch (section.sectionType) {
    case 'hero':
      return (
        <HeroSection
          content={section.content}
          wedding={wedding}
          ornamentStyle={ornamentStyle}
          onPrimaryAction={onPrimaryAction}
        />
      );
    case 'our_story':
      return (
        <OurStorySection
          content={section.content}
          ornamentStyle={ornamentStyle}
          onOpenFullStory={onOpenFullStory}
        />
      );
    case 'event_schedule':
      return (
        <EventScheduleSection
          content={section.content}
          timezone={wedding.timezone}
          ornamentStyle={ornamentStyle}
        />
      );
    case 'venue_travel':
      return <VenueTravelSection content={section.content} ornamentStyle={ornamentStyle} />;
    case 'dress_code':
      return <DressCodeSection content={section.content} ornamentStyle={ornamentStyle} />;
    case 'faq_notes':
      return <FaqNotesSection content={section.content} ornamentStyle={ornamentStyle} />;
    case 'rsvp_banner':
      return (
        <RsvpBannerSection
          content={section.content}
          wedding={wedding}
          ornamentStyle={ornamentStyle}
          onPrimaryAction={onPrimaryAction}
        />
      );
  }
}

export function createStarterInvitationDocument(params: {
  readonly wedding: InvitationWeddingMetadata;
  readonly presetId?: WeddingThemePresetId | undefined;
  readonly dressCode?: string | undefined;
}): InvitationDocument {
  const { wedding, presetId = 'editorial_ivory', dressCode = '' } = params;

  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    wedding,
    theme: {
      schemaVersion: DESIGN_SCHEMA_VERSION,
      presetId,
      tokenOverrides: {},
    },
    sections: [
      {
        id: 'starter-hero',
        sectionType: 'hero',
        sortOrder: 0,
        isVisible: true,
        schemaVersion: DESIGN_SCHEMA_VERSION,
        content: SECTION_REGISTRY.hero.createStarterContent(wedding, dressCode),
      },
      {
        id: 'starter-our-story',
        sectionType: 'our_story',
        sortOrder: 1,
        isVisible: true,
        schemaVersion: DESIGN_SCHEMA_VERSION,
        content: SECTION_REGISTRY.our_story.createStarterContent(wedding, dressCode),
      },
      {
        id: 'starter-event-schedule',
        sectionType: 'event_schedule',
        sortOrder: 2,
        isVisible: true,
        schemaVersion: DESIGN_SCHEMA_VERSION,
        content: SECTION_REGISTRY.event_schedule.createStarterContent(wedding, dressCode),
      },
      {
        id: 'starter-venue-travel',
        sectionType: 'venue_travel',
        sortOrder: 3,
        isVisible: true,
        schemaVersion: DESIGN_SCHEMA_VERSION,
        content: SECTION_REGISTRY.venue_travel.createStarterContent(wedding, dressCode),
      },
      {
        id: 'starter-dress-code',
        sectionType: 'dress_code',
        sortOrder: 4,
        isVisible: dressCode.trim().length > 0,
        schemaVersion: DESIGN_SCHEMA_VERSION,
        content: SECTION_REGISTRY.dress_code.createStarterContent(wedding, dressCode),
      },
      {
        id: 'starter-faq-notes',
        sectionType: 'faq_notes',
        sortOrder: 5,
        isVisible: false,
        schemaVersion: DESIGN_SCHEMA_VERSION,
        content: SECTION_REGISTRY.faq_notes.createStarterContent(wedding, dressCode),
      },
      {
        id: 'starter-rsvp-banner',
        sectionType: 'rsvp_banner',
        sortOrder: 6,
        isVisible: true,
        schemaVersion: DESIGN_SCHEMA_VERSION,
        content: SECTION_REGISTRY.rsvp_banner.createStarterContent(wedding, dressCode),
      },
    ],
  };
}
