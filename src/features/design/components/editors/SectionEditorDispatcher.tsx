import { RotateCcw } from 'lucide-react';
import { type JSX, useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DressCodeSectionEditor } from '@/features/design/components/editors/DressCodeSectionEditor';
import { EventScheduleSectionEditor } from '@/features/design/components/editors/EventScheduleSectionEditor';
import { FaqNotesSectionEditor } from '@/features/design/components/editors/FaqNotesSectionEditor';
import { HeroSectionEditor } from '@/features/design/components/editors/HeroSectionEditor';
import { OurStorySectionEditor } from '@/features/design/components/editors/OurStorySectionEditor';
import { RsvpBannerSectionEditor } from '@/features/design/components/editors/RsvpBannerSectionEditor';
import { VenueTravelSectionEditor } from '@/features/design/components/editors/VenueTravelSectionEditor';
import { SECTION_REGISTRY } from '@/features/design/registry/sectionRegistry';
import type {
  InvitationSection,
  InvitationWeddingMetadata,
} from '@/features/design/schemas/designSchemas';

export interface SectionEditorDispatcherProps {
  readonly section: InvitationSection;
  readonly wedding: InvitationWeddingMetadata;
  readonly dressCode: string;
  readonly canEdit: boolean;
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

      {section.sectionType === 'hero' ? (
        <HeroSectionEditor
          key={editorKey}
          content={section.content}
          canEdit={canEdit}
          onValidChange={(content) => onUpdateSection({ ...section, content })}
          onValidationIssue={handleValidationIssue}
        />
      ) : null}

      {section.sectionType === 'our_story' ? (
        <OurStorySectionEditor
          key={editorKey}
          content={section.content}
          canEdit={canEdit}
          onValidChange={(content) => onUpdateSection({ ...section, content })}
          onValidationIssue={handleValidationIssue}
        />
      ) : null}

      {section.sectionType === 'event_schedule' ? (
        <EventScheduleSectionEditor
          key={editorKey}
          content={section.content}
          timezone={wedding.timezone}
          canEdit={canEdit}
          onValidChange={(content) => onUpdateSection({ ...section, content })}
          onValidationIssue={handleValidationIssue}
        />
      ) : null}

      {section.sectionType === 'venue_travel' ? (
        <VenueTravelSectionEditor
          key={editorKey}
          content={section.content}
          canEdit={canEdit}
          onValidChange={(content) => onUpdateSection({ ...section, content })}
          onValidationIssue={handleValidationIssue}
        />
      ) : null}

      {section.sectionType === 'dress_code' ? (
        <DressCodeSectionEditor
          key={editorKey}
          content={section.content}
          canEdit={canEdit}
          onValidChange={(content) => onUpdateSection({ ...section, content })}
          onValidationIssue={handleValidationIssue}
        />
      ) : null}

      {section.sectionType === 'faq_notes' ? (
        <FaqNotesSectionEditor
          key={editorKey}
          content={section.content}
          canEdit={canEdit}
          onValidChange={(content) => onUpdateSection({ ...section, content })}
          onValidationIssue={handleValidationIssue}
        />
      ) : null}

      {section.sectionType === 'rsvp_banner' ? (
        <RsvpBannerSectionEditor
          key={editorKey}
          content={section.content}
          canEdit={canEdit}
          onValidChange={(content) => onUpdateSection({ ...section, content })}
          onValidationIssue={handleValidationIssue}
        />
      ) : null}
    </div>
  );
}
