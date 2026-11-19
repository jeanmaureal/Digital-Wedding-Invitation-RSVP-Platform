import { AlertCircle, ArrowDown, ArrowUp, Eye, EyeOff } from 'lucide-react';
import type { JSX } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SECTION_REGISTRY } from '@/features/design/registry/sectionRegistry';
import type { InvitationSection } from '@/features/design/schemas/designSchemas';

export interface SectionStackSidebarProps {
  readonly sections: readonly InvitationSection[];
  readonly activeSectionId: string;
  readonly canEdit: boolean;
  readonly validationIssues: Readonly<Record<string, string>>;
  readonly onSelectSection: (sectionId: string) => void;
  readonly onToggleVisibility: (section: InvitationSection) => void;
  readonly onMoveSection: (sectionId: string, direction: 'up' | 'down') => void;
}

export function SectionStackSidebar({
  sections,
  activeSectionId,
  canEdit,
  validationIssues,
  onSelectSection,
  onToggleVisibility,
  onMoveSection,
}: SectionStackSidebarProps): JSX.Element {
  const orderedSections = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleCount = orderedSections.filter((sec) => sec.isVisible).length;

  return (
    <div className="space-y-2.5" data-testid="section-stack-sidebar">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide uppercase">
          Invitation Section Stack ({visibleCount}/{orderedSections.length} visible)
        </p>
        {visibleCount <= 1 ? (
          <span
            className="text-muted-foreground text-[11px]"
            data-testid="last-visible-section-note"
          >
            At least 1 section stays visible
          </span>
        ) : null}
      </div>

      <ul className="space-y-1.5" aria-label="Invitation sections">
        {orderedSections.map((section, index) => {
          const entry = SECTION_REGISTRY[section.sectionType];
          const isSelected = section.id === activeSectionId;
          const hasIssue = Boolean(validationIssues[`section:${section.id}`]);
          const isLastVisible = section.isVisible && visibleCount <= 1;

          return (
            <li
              key={section.id}
              data-testid={`section-stack-item-${section.sectionType}`}
              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                isSelected ? 'border-primary bg-primary/5 ring-primary/25 ring-1' : 'bg-background'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectSection(section.id)}
                data-testid={`select-section-${section.sectionType}`}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="text-muted-foreground w-5 shrink-0 font-mono text-xs">
                  {index + 1}.
                </span>
                <span
                  className={`truncate text-sm font-medium ${
                    !section.isVisible ? 'text-muted-foreground line-through' : ''
                  }`}
                >
                  {entry.label}
                </span>
                {hasIssue ? (
                  <AlertCircle
                    className="text-destructive size-3.5 shrink-0"
                    aria-label="Validation error"
                  />
                ) : null}
                {!section.isVisible ? (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    Hidden
                  </Badge>
                ) : null}
              </button>

              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={!canEdit || isLastVisible}
                  aria-pressed={section.isVisible}
                  aria-label={section.isVisible ? `Hide ${entry.label}` : `Show ${entry.label}`}
                  data-testid={`toggle-section-visibility-${section.sectionType}`}
                  onClick={() => onToggleVisibility(section)}
                >
                  {section.isVisible ? (
                    <Eye className="size-3.5" aria-hidden="true" />
                  ) : (
                    <EyeOff className="text-muted-foreground size-3.5" aria-hidden="true" />
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={!canEdit || index === 0}
                  aria-label={`Move ${entry.label} up`}
                  data-testid={`move-section-up-${section.sectionType}`}
                  onClick={() => onMoveSection(section.id, 'up')}
                >
                  <ArrowUp className="size-3.5" aria-hidden="true" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={!canEdit || index === orderedSections.length - 1}
                  aria-label={`Move ${entry.label} down`}
                  data-testid={`move-section-down-${section.sectionType}`}
                  onClick={() => onMoveSection(section.id, 'down')}
                >
                  <ArrowDown className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
