import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  Layers,
  Loader2,
  Monitor,
  Palette,
  Save,
  Send,
  Smartphone,
} from 'lucide-react';
import { type JSX, useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SectionStackSidebar } from '@/features/design/components/builder/SectionStackSidebar';
import { ThemeControlsPanel } from '@/features/design/components/builder/ThemeControlsPanel';
import { SectionEditorDispatcher } from '@/features/design/components/editors/SectionEditorDispatcher';
import {
  InvitationRenderer,
  type InvitationViewportMode,
} from '@/features/design/components/InvitationRenderer';
import {
  type BuilderAutosaveStatus,
  useDebouncedDesignAutosave,
} from '@/features/design/hooks/useDebouncedDesignAutosave';
import type {
  InvitationDocument,
  InvitationSection,
} from '@/features/design/schemas/designSchemas';
import { getNormalizedCustomFonts } from '@/features/design/themes/themePresets';
import type { WeddingRecord, WeddingSettingsRecord } from '@/features/weddings/api/weddingApi';
import { canCreateOrEditWedding } from '@/features/weddings/permissions/weddingPermissions';
import {
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from '@/features/workspace/schemas/workspaceSchemas';
import { buildOrganizerWeddingPath } from '@/lib/constants/routes';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

type InspectorTab = 'sections' | 'theme';
type MobileWorkspacePane = 'editor' | 'preview';

export interface WeddingInvitationBuilderProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly callerRole: WorkspaceRole;
  readonly wedding: WeddingRecord;
  readonly settings: WeddingSettingsRecord;
  readonly initialDocument: InvitationDocument;
  readonly debounceMs?: number | undefined;
  readonly client?: TypedSupabaseClient | null | undefined;
  readonly onPublishSnapshot?: (() => Promise<{ readonly versionNumber: number }>) | undefined;
}

function renderStatusSummary(
  status: BuilderAutosaveStatus,
  canEdit: boolean,
): { readonly label: string; readonly variant: 'secondary' | 'outline' | 'destructive' } {
  if (!canEdit) {
    return { label: 'Read-only mode', variant: 'outline' };
  }
  switch (status) {
    case 'saved':
      return { label: 'All changes saved', variant: 'secondary' };
    case 'dirty':
      return { label: 'Unsaved changes…', variant: 'outline' };
    case 'saving':
      return { label: 'Saving draft…', variant: 'outline' };
    case 'validation_error':
      return { label: 'Fix validation issues to autosave', variant: 'destructive' };
    case 'save_error':
      return { label: 'Save failed — retry needed', variant: 'destructive' };
  }
}

export function WeddingInvitationBuilder({
  userId,
  workspaceId,
  callerRole,
  wedding,
  settings,
  initialDocument,
  debounceMs,
  client,
  onPublishSnapshot,
}: WeddingInvitationBuilderProps): JSX.Element {
  const navigate = useNavigate();
  const canEdit = canCreateOrEditWedding(callerRole);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const {
    draftDocument,
    saveStatus,
    lastSaveError,
    validationIssues,
    queueThemeUpdate,
    queueSectionUpdate,
    reorderSections,
    reportValidationIssue,
    flushPendingSaves,
  } = useDebouncedDesignAutosave({
    userId,
    workspaceId,
    weddingId: wedding.id,
    canEdit,
    initialDocument,
    debounceMs,
    client,
  });

  const sortedSections = [...draftDocument.sections].sort((a, b) => a.sortOrder - b.sortOrder);

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('sections');
  const [mobilePane, setMobilePane] = useState<MobileWorkspacePane>('editor');
  const [viewportMode, setViewportMode] = useState<InvitationViewportMode>('desktop');
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    () => sortedSections[0]?.id ?? '',
  );

  const activeSection =
    sortedSections.find((sec) => sec.id === selectedSectionId) ?? sortedSections[0];

  const handleToggleVisibility = useCallback(
    (section: InvitationSection) => {
      if (!canEdit) {
        return;
      }
      const visibleCount = draftDocument.sections.filter((s) => s.isVisible).length;
      if (section.isVisible && visibleCount <= 1) {
        return;
      }
      queueSectionUpdate(
        {
          ...section,
          isVisible: !section.isVisible,
        },
        { immediate: true },
      );
    },
    [canEdit, draftDocument.sections, queueSectionUpdate],
  );

  const handleMoveSection = useCallback(
    (sectionId: string, direction: 'up' | 'down') => {
      if (!canEdit) {
        return;
      }
      const ordered = [...draftDocument.sections].sort((a, b) => a.sortOrder - b.sortOrder);
      const index = ordered.findIndex((sec) => sec.id === sectionId);
      if (index < 0) {
        return;
      }
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= ordered.length) {
        return;
      }
      const nextIds = ordered.map((sec) => sec.id);
      const currentId = nextIds[index]!;
      const swappedId = nextIds[targetIndex]!;
      nextIds[index] = swappedId;
      nextIds[targetIndex] = currentId;

      void reorderSections(nextIds);
    },
    [canEdit, draftDocument.sections, reorderSections],
  );

  const handleSectionValidationIssue = useCallback(
    (sectionId: string, message: string | null) => {
      reportValidationIssue(`section:${sectionId}`, message);
    },
    [reportValidationIssue],
  );

  const handleThemeValidationIssue = useCallback(
    (message: string | null) => {
      reportValidationIssue('theme', message);
    },
    [reportValidationIssue],
  );

  const handleBackToWeddingDetail = async () => {
    const targetPath = buildOrganizerWeddingPath(wedding.id);
    if (canEdit && (saveStatus === 'dirty' || saveStatus === 'save_error')) {
      await flushPendingSaves();
    }
    if (Object.keys(validationIssues).length > 0) {
      const confirmed = window.confirm(
        'Some fields have validation errors that have not been saved. Leave the builder anyway?',
      );
      if (!confirmed) {
        return;
      }
    }
    void navigate(targetPath);
  };

  const handlePublishClick = async () => {
    if (!canEdit || !onPublishSnapshot || isPublishing || wedding.status === 'archived') {
      return;
    }
    if (Object.keys(validationIssues).length > 0) {
      return;
    }
    setPublishError(null);
    setPublishNotice(null);
    setIsPublishing(true);
    try {
      await flushPendingSaves();
      const result = await onPublishSnapshot();
      setPublishNotice(`Published live snapshot v${result.versionNumber} to /w/${wedding.slug}.`);
    } catch (err: unknown) {
      setPublishError(err instanceof Error ? err.message : 'Unable to publish website.');
    } finally {
      setIsPublishing(false);
    }
  };

  const statusMeta = renderStatusSummary(saveStatus, canEdit);
  const firstValidationMessage = Object.values(validationIssues)[0] ?? null;

  return (
    <div data-testid="wedding-invitation-builder" className="space-y-5">
      {/* Top Builder Header Bar */}
      <div className="bg-background flex flex-col justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 h-8"
              data-testid="builder-back-to-wedding-button"
              onClick={() => void handleBackToWeddingDetail()}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to project overview
            </Button>
            <Badge variant="outline">/w/{wedding.slug}</Badge>
            {!canEdit ? (
              <Badge variant="outline" data-testid="builder-readonly-badge">
                Read-only ({WORKSPACE_ROLE_LABELS[callerRole]})
              </Badge>
            ) : null}
          </div>

          <h1
            id="wedding-builder-heading"
            data-testid="wedding-builder-heading"
            className="text-xl font-semibold tracking-tight sm:text-2xl"
          >
            {wedding.title} — Invitation Builder
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={statusMeta.variant}
            data-testid="builder-autosave-status"
            data-autosave-state={saveStatus}
            className="gap-1.5 px-2.5 py-1 text-xs"
          >
            {saveStatus === 'saving' ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : saveStatus === 'saved' && canEdit ? (
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
            ) : saveStatus === 'validation_error' || saveStatus === 'save_error' ? (
              <AlertTriangle className="size-3.5" aria-hidden="true" />
            ) : null}
            <span>{statusMeta.label}</span>
          </Badge>

          {canEdit && (saveStatus === 'dirty' || saveStatus === 'save_error') ? (
            <Button
              type="button"
              size="sm"
              variant={saveStatus === 'save_error' ? 'default' : 'outline'}
              className="h-8 text-xs"
              data-testid="builder-save-now-button"
              onClick={() => void flushPendingSaves()}
            >
              <Save className="size-3.5" aria-hidden="true" />
              {saveStatus === 'save_error' ? 'Retry save' : 'Save now'}
            </Button>
          ) : null}

          {canEdit && onPublishSnapshot && wedding.status !== 'archived' ? (
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              disabled={
                isPublishing || saveStatus === 'saving' || Object.keys(validationIssues).length > 0
              }
              data-testid="builder-publish-button"
              onClick={() => void handlePublishClick()}
            >
              <Send className="size-3.5" aria-hidden="true" />
              {isPublishing ? 'Publishing…' : 'Publish snapshot'}
            </Button>
          ) : null}

          <div
            className="inline-flex rounded-md border p-0.5"
            role="group"
            aria-label="Preview viewport"
          >
            <Button
              type="button"
              size="sm"
              variant={viewportMode === 'desktop' ? 'default' : 'ghost'}
              className="h-7 px-2.5 text-xs"
              data-testid="builder-viewport-desktop-button"
              onClick={() => setViewportMode('desktop')}
            >
              <Monitor className="size-3.5" aria-hidden="true" />
              Desktop
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewportMode === 'mobile' ? 'default' : 'ghost'}
              className="h-7 px-2.5 text-xs"
              data-testid="builder-viewport-mobile-button"
              onClick={() => setViewportMode('mobile')}
            >
              <Smartphone className="size-3.5" aria-hidden="true" />
              Mobile
            </Button>
          </div>
        </div>
      </div>

      {/* Save Error, Publish Feedback or Validation Summary Banner */}
      {publishError ? (
        <div
          role="alert"
          data-testid="builder-publish-error-banner"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {publishError}
        </div>
      ) : null}

      {publishNotice ? (
        <div
          role="status"
          data-testid="builder-publish-success-banner"
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-900 dark:text-emerald-200"
        >
          {publishNotice}
        </div>
      ) : null}

      {lastSaveError ? (
        <div
          role="alert"
          data-testid="builder-save-error-banner"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {lastSaveError}
        </div>
      ) : null}

      {firstValidationMessage ? (
        <div
          role="alert"
          data-testid="builder-validation-banner"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-4 py-2.5 text-xs font-medium"
        >
          Autosave paused: {firstValidationMessage}
        </div>
      ) : null}

      {/* Mobile Pane Switcher (`< lg`) */}
      <div
        className="grid grid-cols-2 gap-1 rounded-lg border p-1 lg:hidden"
        role="tablist"
        aria-label="Builder mobile view"
      >
        <Button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'editor'}
          variant={mobilePane === 'editor' ? 'default' : 'ghost'}
          size="sm"
          data-testid="mobile-pane-editor-tab"
          onClick={() => setMobilePane('editor')}
        >
          <Layers className="size-4" aria-hidden="true" />
          Edit Design
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'preview'}
          variant={mobilePane === 'preview' ? 'default' : 'ghost'}
          size="sm"
          data-testid="mobile-pane-preview-tab"
          onClick={() => setMobilePane('preview')}
        >
          <Eye className="size-4" aria-hidden="true" />
          Live Preview
        </Button>
      </div>

      {/* Main Split Builder Workspace */}
      <div className="grid items-start gap-6 lg:grid-cols-12">
        {/* Left Inspector Column */}
        <div
          className={`space-y-4 lg:col-span-5 ${
            mobilePane === 'preview' ? 'hidden lg:block' : 'block'
          }`}
        >
          <Card>
            <CardContent className="space-y-5 pt-5">
              <div
                className="grid grid-cols-2 gap-1 rounded-lg border p-1"
                role="tablist"
                aria-label="Builder inspector tabs"
              >
                <Button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === 'sections'}
                  variant={inspectorTab === 'sections' ? 'default' : 'ghost'}
                  size="sm"
                  data-testid="inspector-tab-sections"
                  onClick={() => setInspectorTab('sections')}
                >
                  <Layers className="size-4" aria-hidden="true" />
                  Sections &amp; Copy
                </Button>
                <Button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === 'theme'}
                  variant={inspectorTab === 'theme' ? 'default' : 'ghost'}
                  size="sm"
                  data-testid="inspector-tab-theme"
                  onClick={() => setInspectorTab('theme')}
                >
                  <Palette className="size-4" aria-hidden="true" />
                  Theme &amp; Tokens
                </Button>
              </div>

              {inspectorTab === 'sections' ? (
                <div className="space-y-6">
                  <SectionStackSidebar
                    sections={draftDocument.sections}
                    activeSectionId={activeSection?.id ?? ''}
                    canEdit={canEdit}
                    validationIssues={validationIssues}
                    onSelectSection={(id) => setSelectedSectionId(id)}
                    onToggleVisibility={handleToggleVisibility}
                    onMoveSection={handleMoveSection}
                  />

                  {activeSection ? (
                    <div className="border-t pt-5">
                      <SectionEditorDispatcher
                        section={activeSection}
                        wedding={draftDocument.wedding}
                        dressCode={settings.dress_code}
                        canEdit={canEdit}
                        customFonts={getNormalizedCustomFonts(draftDocument.theme.tokenOverrides)}
                        workspaceId={workspaceId}
                        weddingId={wedding.id}
                        client={client}
                        onUpdateSection={queueSectionUpdate}
                        onSectionValidationIssue={handleSectionValidationIssue}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <ThemeControlsPanel
                  key={`theme:${themePanelResetKey(draftDocument.theme.presetId)}`}
                  theme={draftDocument.theme}
                  canEdit={canEdit}
                  workspaceId={workspaceId}
                  weddingId={wedding.id}
                  client={client}
                  onUpdateTheme={queueThemeUpdate}
                  onThemeValidationIssue={handleThemeValidationIssue}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Live Preview Stage */}
        <div
          data-testid="builder-live-preview-stage"
          className={`lg:sticky lg:top-6 lg:col-span-7 ${
            mobilePane === 'editor' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="bg-muted/30 rounded-xl border p-3 sm:p-5">
            <InvitationRenderer document={draftDocument} viewportMode={viewportMode} />
          </div>
        </div>
      </div>
    </div>
  );
}

function themePanelResetKey(presetId: string): string {
  return presetId;
}
