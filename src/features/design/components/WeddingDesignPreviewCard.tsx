import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Monitor, Palette, PencilRuler, RefreshCw, Smartphone } from 'lucide-react';
import { type JSX, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  fetchWeddingDesignDraft,
  updateWeddingThemeDraft,
} from '@/features/design/api/designDraftApi';
import { translateDesignError } from '@/features/design/api/designErrors';
import {
  InvitationRenderer,
  type InvitationViewportMode,
} from '@/features/design/components/InvitationRenderer';
import { designQueryKeys } from '@/features/design/queryKeys';
import { SECTION_REGISTRY } from '@/features/design/registry/sectionRegistry';
import type {
  InvitationWeddingMetadata,
  WeddingThemePresetId,
} from '@/features/design/schemas/designSchemas';
import { WEDDING_THEME_PRESET_LIST } from '@/features/design/themes/themePresets';
import type { WeddingRecord, WeddingSettingsRecord } from '@/features/weddings/api/weddingApi';
import { canCreateOrEditWedding } from '@/features/weddings/permissions/weddingPermissions';
import {
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from '@/features/workspace/schemas/workspaceSchemas';
import { buildOrganizerWeddingBuilderPath } from '@/lib/constants/routes';

export interface WeddingDesignPreviewCardProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly callerRole: WorkspaceRole;
  readonly wedding: WeddingRecord;
  readonly settings: WeddingSettingsRecord;
}

export function WeddingDesignPreviewCard({
  userId,
  workspaceId,
  callerRole,
  wedding,
  settings,
}: WeddingDesignPreviewCardProps): JSX.Element {
  const queryClient = useQueryClient();
  const canEdit = canCreateOrEditWedding(callerRole);

  const [viewportMode, setViewportMode] = useState<InvitationViewportMode>('desktop');
  const [pendingPreset, setPendingPreset] = useState<WeddingThemePresetId | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedThemeName, setSavedThemeName] = useState<string | null>(null);

  const weddingMetadata: InvitationWeddingMetadata = {
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
  };

  const designQuery = useQuery({
    queryKey: designQueryKeys.draft(userId, workspaceId, wedding.id),
    queryFn: () =>
      fetchWeddingDesignDraft({
        workspaceId,
        weddingId: wedding.id,
        weddingMetadata,
      }),
    enabled: Boolean(userId && workspaceId && wedding.id),
  });

  const onSelectThemePreset = async (presetId: WeddingThemePresetId): Promise<void> => {
    if (!canEdit || !designQuery.data || designQuery.data.theme.presetId === presetId) {
      return;
    }
    setSaveError(null);
    setSavedThemeName(null);
    setPendingPreset(presetId);
    try {
      await updateWeddingThemeDraft({
        workspaceId,
        weddingId: wedding.id,
        presetId,
        tokenOverrides: designQuery.data.theme.tokenOverrides,
      });
      await queryClient.invalidateQueries({
        queryKey: designQueryKeys.draft(userId, workspaceId, wedding.id),
      });
      const preset = WEDDING_THEME_PRESET_LIST.find((p) => p.id === presetId);
      setSavedThemeName(preset?.name ?? presetId);
    } catch (error: unknown) {
      setSaveError(translateDesignError(error).message);
    } finally {
      setPendingPreset(null);
    }
  };

  const activePresetId = designQuery.data?.theme.presetId ?? 'editorial_ivory';

  return (
    <Card data-testid="wedding-design-preview-card">
      <CardHeader className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Palette className="text-primary size-5" aria-hidden="true" />
            <span>Invitation Design System &amp; Live Preview</span>
          </CardTitle>
          <CardDescription>
            Choose one of the 4 curated wedding themes, inspect your schema-validated draft
            invitation in Desktop or Mobile view, or open the full Invitation Builder to customize
            section copy, order, visibility, and theme tokens.
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!canEdit ? (
            <Badge variant="outline" data-testid="wedding-design-readonly-badge">
              Read-only ({WORKSPACE_ROLE_LABELS[callerRole]})
            </Badge>
          ) : null}

          <Button asChild size="sm" className="h-8 text-xs">
            <Link
              to={buildOrganizerWeddingBuilderPath(wedding.id)}
              data-testid="open-invitation-builder-link"
            >
              <PencilRuler className="size-3.5" aria-hidden="true" />
              {canEdit ? 'Open Invitation Builder' : 'Inspect in Builder'}
            </Link>
          </Button>

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
              onClick={() => setViewportMode('desktop')}
              data-testid="preview-viewport-desktop-button"
            >
              <Monitor className="size-3.5" aria-hidden="true" />
              Desktop
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewportMode === 'mobile' ? 'default' : 'ghost'}
              className="h-7 px-2.5 text-xs"
              onClick={() => setViewportMode('mobile')}
              data-testid="preview-viewport-mobile-button"
            >
              <Smartphone className="size-3.5" aria-hidden="true" />
              Mobile
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {saveError ? (
          <div
            role="alert"
            data-testid="wedding-design-error"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
          >
            {saveError}
          </div>
        ) : null}

        {savedThemeName ? (
          <div
            role="status"
            data-testid="wedding-theme-saved-notice"
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-900 dark:text-emerald-200"
          >
            Theme updated to <strong>{savedThemeName}</strong>.
          </div>
        ) : null}

        <div
          role="radiogroup"
          aria-label="Wedding theme preset"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {WEDDING_THEME_PRESET_LIST.map((preset) => {
            const isSelected = activePresetId === preset.id;
            const isSavingThis = pendingPreset === preset.id;

            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!canEdit || pendingPreset !== null || designQuery.isPending}
                onClick={() => void onSelectThemePreset(preset.id)}
                data-testid={`theme-preset-option-${preset.id}`}
                className={`flex flex-col justify-between rounded-lg border p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  isSelected
                    ? 'border-primary ring-primary/30 ring-2'
                    : 'hover:border-foreground/30'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5" aria-hidden="true">
                      <span
                        className="inline-block size-4 rounded-full border"
                        style={{
                          backgroundColor: preset.canvasBg,
                          borderColor: preset.borderColor,
                        }}
                      />
                      <span
                        className="inline-block size-4 rounded-full border"
                        style={{
                          backgroundColor: preset.accentHex,
                          borderColor: preset.borderColor,
                        }}
                      />
                      <span
                        className="inline-block size-4 rounded-full border"
                        style={{
                          backgroundColor: preset.inkPrimary,
                          borderColor: preset.borderColor,
                        }}
                      />
                    </div>

                    {isSelected ? (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Check className="size-3" aria-hidden="true" />
                        Active
                      </Badge>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-sm font-semibold">
                      {isSavingThis ? `Applying ${preset.name}…` : preset.name}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
                      {preset.tagline}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {designQuery.isPending ? (
          <div
            data-testid="wedding-design-loading"
            className="text-muted-foreground rounded-lg border py-10 text-center text-sm"
          >
            Loading invitation design &amp; sections…
          </div>
        ) : designQuery.isError ? (
          <div
            role="alert"
            data-testid="wedding-design-load-error"
            className="space-y-3 rounded-lg border p-6"
          >
            <p className="text-sm font-medium">Unable to load invitation design</p>
            <p className="text-muted-foreground text-xs">
              {translateDesignError(designQuery.error).message}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void designQuery.refetch()}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : designQuery.data ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground font-medium">Registered sections:</span>
              {[...designQuery.data.sections]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((sec) => (
                  <Badge
                    key={sec.id}
                    variant={sec.isVisible ? 'secondary' : 'outline'}
                    className={!sec.isVisible ? 'opacity-60' : undefined}
                  >
                    {SECTION_REGISTRY[sec.sectionType].label}
                    {!sec.isVisible ? ' (Hidden)' : ''}
                  </Badge>
                ))}
            </div>

            <div className="bg-muted/30 rounded-xl border p-3 sm:p-6">
              <InvitationRenderer
                document={{
                  ...designQuery.data,
                  wedding: weddingMetadata,
                }}
                viewportMode={viewportMode}
              />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
