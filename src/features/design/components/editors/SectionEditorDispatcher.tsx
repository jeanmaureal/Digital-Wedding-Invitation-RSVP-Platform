import { RotateCcw } from 'lucide-react';
import { type JSX, useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DressCodeSectionEditor } from '@/features/design/components/editors/DressCodeSectionEditor';
import { EventScheduleSectionEditor } from '@/features/design/components/editors/EventScheduleSectionEditor';
import { FaqNotesSectionEditor } from '@/features/design/components/editors/FaqNotesSectionEditor';
import { GiftRegistrySectionEditor } from '@/features/design/components/editors/GiftRegistrySectionEditor';
import { HeroSectionEditor } from '@/features/design/components/editors/HeroSectionEditor';
import { OurStorySectionEditor } from '@/features/design/components/editors/OurStorySectionEditor';
import { RsvpBannerSectionEditor } from '@/features/design/components/editors/RsvpBannerSectionEditor';
import { SectionStyleControls } from '@/features/design/components/editors/SectionStyleControls';
import { VenueTravelSectionEditor } from '@/features/design/components/editors/VenueTravelSectionEditor';
import { SECTION_REGISTRY } from '@/features/design/registry/sectionRegistry';
import type {
  CustomFontAsset,
  InvitationSection,
  InvitationWeddingMetadata,
  SectionStyleOverrides,
} from '@/features/design/schemas/designSchemas';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

export interface SectionEditorDispatcherProps {
  readonly section: InvitationSection;
  readonly wedding: InvitationWeddingMetadata;
  readonly dressCode: string;
  readonly canEdit: boolean;
  readonly customFonts?: readonly CustomFontAsset[] | undefined;
  readonly workspaceId?: string | undefined;
  readonly weddingId?: string | undefined;
  readonly client?: TypedSupabaseClient | null | undefined;
  readonly onUpdateSection: (
    nextSection: InvitationSection,
    options?: { readonly immediate?: boolean | undefined },
  ) => void;
  readonly onSectionValidationIssue: (sectionId: string, message: string | null) => void;
}

export function SectionEditorDispatcher({
  section,
  wedding,
  dressCode,
  canEdit,
  customFonts = [],
  workspaceId,
  weddingId,
  client,
  onUpdateSection,
  onSectionValidationIssue,
}: SectionEditorDispatcherProps): JSX.Element {
  const [resetGeneration, setResetGeneration] = useState(0);
  const registryEntry = SECTION_REGISTRY[section.sectionType];

  const handleValidationIssue = useCallback(
    (message: string | null) => {
      onSectionValidationIssue(section.id, message);
    },
    [onSectionValidationIssue, section.id],
  );

  const handleResetToStarter = () => {
    if (!canEdit) {
      return;
    }
    let nextSection: InvitationSection;
    switch (section.sectionType) {
      case 'hero':
        nextSection = {
          ...section,
          content: SECTION_REGISTRY.hero.createStarterContent(wedding, dressCode),
        };
        break;
      case 'our_story':
        nextSection = {
          ...section,
          content: SECTION_REGISTRY.our_story.createStarterContent(wedding, dressCode),
        };
        break;
      case 'event_schedule':
        nextSection = {
          ...section,
          content: SECTION_REGISTRY.event_schedule.createStarterContent(wedding, dressCode),
        };
        break;
      case 'venue_travel':
        nextSection = {
          ...section,
          content: SECTION_REGISTRY.venue_travel.createStarterContent(wedding, dressCode),
        };
        break;
      case 'dress_code':
        nextSection = {
          ...section,
          content: SECTION_REGISTRY.dress_code.createStarterContent(wedding, dressCode),
        };
        break;
      case 'faq_notes':
        nextSection = {
          ...section,
          content: SECTION_REGISTRY.faq_notes.createStarterContent(wedding, dressCode),
        };
        break;
      case 'gift_registry':
        nextSection = {
          ...section,
          content: SECTION_REGISTRY.gift_registry.createStarterContent(wedding, dressCode),
        };
        break;
      case 'rsvp_banner':
        nextSection = {
          ...section,
          content: SECTION_REGISTRY.rsvp_banner.createStarterContent(wedding, dressCode),
        };
        break;
    }
    onSectionValidationIssue(section.id, null);
    onUpdateSection(nextSection, { immediate: true });
    setResetGeneration((prev) => prev + 1);
  };

  const editorKey = `${section.id}:${resetGeneration}`;

  const mergeContentPreservingStyle = <T extends Record<string, unknown>>(nextContent: T): T => {
    const existingStyle = section.content.style;
    if (!existingStyle) {
      return nextContent;
    }
    return { ...nextContent, style: existingStyle };
  };

  const handleStyleChange = (nextStyle: SectionStyleOverrides | undefined) => {
    const nextContent = { ...section.content };
    if (nextStyle && Object.keys(nextStyle).length > 0) {
      nextContent.style = nextStyle;
    } else {
      delete nextContent.style;
    }
    onUpdateSection({ ...section, content: nextContent } as InvitationSection);
  };

  return (
    <div className="space-y-4" data-testid="active-section-editor-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{registryEntry.label}</h3>
            <Badge variant={section.isVisible ? 'secondary' : 'outline'}>
              {section.isVisible ? 'Visible in invitation' : 'Hidden from guests'}
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs">{registryEntry.description}</p>
          <p className="text-muted-foreground text-[11px]">
            Formatting supported in text fields: <code className="rounded bg-muted px-1">**bold**</code>,{' '}
            <code className="rounded bg-muted px-1">*italic*</code>,{' '}
            <code className="rounded bg-muted px-1">~~strike~~</code>,{' '}
            <code className="rounded bg-muted px-1">`highlight`</code>,{' '}
            <code className="rounded bg-muted px-1">[link](https://...)</code>, and{' '}
            <code className="rounded bg-muted px-1">- bullet</code> lists.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canEdit}
          data-testid="reset-section-starter-button"
          onClick={handleResetToStarter}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Reset starter copy
        </Button>
      </div>

      <SectionStyleControls
        key={`style:${editorKey}`}
        sectionType={section.sectionType}
        style={section.content.style}
        customFonts={customFonts}
        canEdit={canEdit}
        onChangeStyle={handleStyleChange}
        onValidationIssue={handleValidationIssue}
      />

      {section.sectionType === 'hero' ? (
        <HeroSectionEditor
          key={editorKey}
          content={section.content}
          canEdit={canEdit}
          onValidChange={(content) =>
            onUpdateSection({ ...section, content: mergeContentPreservingStyle(content) })
          }
          onValidationIssue={handleValidationIssue}
        />
      ) : null}

      {section.sectionType === 'our_story' ? (
        <OurStorySectionEditor
          key={editorKey}
          content={section.content}
          canEdit={canEdit}
          workspaceId={workspaceId}
          weddingId={weddingId}
          client={client}
          onValidChange={(content) =>
            onUpdateSection({ ...section, content: mergeContentPreservingStyle(content) })
          }
          onValidationIssue={handleValidationIssue}
        />
      ) : null}

      {section.sectionType === 'event_schedule' ? (
        <EventScheduleSectionEditor
          key={editorKey}
          content={section.content}
          timezone={wedding.timezone}
          canEdit={canEdit}
          onValidChange={(content) =>
            onUpdateSection({ ...section, content: mergeContentPreservingStyle(content) })
          }
          onValidationIssue={handleValidationIssue}
        />
      ) : null}

      {section.sectionType === 'venue_travel' ? (
        <VenueTravelSectionEditor
          key={editorKey}
          content={section.content}
          canEdit={canEdit}
          onValidChange={(content) =>
            onUpdateSection({ ...section, content: mergeContentPreservingStyle(content) })
          }
          onValidationIssue={handleValidationIssue}
        />
      ) : null}

      {section.sectionType === 'dress_code' ? (
        <DressCodeSectionEditor
          key={editorKey}
          content={section.content}
          canEdit={canEdit}
          onValidChange={(content) =>
            onUpdateSection({ ...section, content: mergeContentPreservingStyle(content) })
          }
          onValidationIssue={handleValidationIssue}
        />
      ) : null}

      {section.sectionType === 'faq_notes' ? (
        <FaqNotesSectionEditor
          key={editorKey}
          content={section.content}
          canEdit={canEdit}
          onValidChange={(content) =>
            onUpdateSection({ ...section, content: mergeContentPreservingStyle(content) })
          }
          onValidationIssue={handleValidationIssue}
        />
      ) : null}

      {section.sectionType === 'gift_registry' ? (
        <GiftRegistrySectionEditor
          key={editorKey}
          content={section.content}
          canEdit={canEdit}
          workspaceId={workspaceId}
          weddingId={weddingId}
          client={client}
          onValidChange={(content) =>
            onUpdateSection({ ...section, content: mergeContentPreservingStyle(content) })
          }
          onValidationIssue={handleValidationIssue}
        />
      ) : null}

      {section.sectionType === 'rsvp_banner' ? (
        <RsvpBannerSectionEditor
          key={editorKey}
          content={section.content}
          canEdit={canEdit}
          onValidChange={(content) =>
            onUpdateSection({ ...section, content: mergeContentPreservingStyle(content) })
          }
          onValidationIssue={handleValidationIssue}
        />
      ) : null}
    </div>
  );
}
