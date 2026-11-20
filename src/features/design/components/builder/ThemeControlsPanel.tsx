import { Check, Image as ImageIcon, Loader2, RotateCcw, Trash2, Type, Upload } from 'lucide-react';
import { type ChangeEvent, type JSX, useRef, useState } from 'react';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  deriveFontDisplayName,
  uploadWeddingDesignAsset,
} from '@/features/design/api/designAssetsApi';
import {
  type CustomFontAsset,
  hexColorSchema,
  httpsUrlSchema,
  type ThemeTokenOverrides,
  type WeddingThemeConfig,
  type WeddingThemePresetId,
} from '@/features/design/schemas/designSchemas';
import {
  buildCustomFontFamilyName,
  DEFAULT_BACKGROUND_OVERLAY_OPACITY,
  DEFAULT_CARD_OPACITY,
  getNormalizedCustomFonts,
  isVideoAssetUrl,
  LEGACY_CUSTOM_FONT_ID,
  WEDDING_THEME_PRESET_LIST,
  WEDDING_THEME_PRESETS,
} from '@/features/design/themes/themePresets';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

const CURATED_ACCENT_SWATCHES = [
  '#9A7B4F',
  '#4F6F58',
  '#C8A45D',
  '#B85D43',
  '#8C3B2B',
  '#2E4A62',
] as const;

type ColorOverrideKey =
  | 'primaryAccentHex'
  | 'canvasBgHex'
  | 'surfaceBgHex'
  | 'inkPrimaryHex'
  | 'inkMutedHex'
  | 'borderColorHex';

interface ColorFieldConfig {
  readonly key: ColorOverrideKey;
  readonly label: string;
  readonly presetKey:
    | 'accentHex'
    | 'canvasBg'
    | 'surfaceBg'
    | 'inkPrimary'
    | 'inkMuted'
    | 'borderColor';
  readonly inputId: string;
  readonly testId: string;
  readonly errorId: string;
}

const COLOR_FIELD_CONFIGS: readonly ColorFieldConfig[] = [
  {
    key: 'canvasBgHex',
    label: 'Canvas background',
    presetKey: 'canvasBg',
    inputId: 'theme-canvas-bg-hex-input',
    testId: 'theme-canvas-bg-hex-input',
    errorId: 'theme-canvas-bg-hex-error',
  },
  {
    key: 'surfaceBgHex',
    label: 'Card surface',
    presetKey: 'surfaceBg',
    inputId: 'theme-surface-bg-hex-input',
    testId: 'theme-surface-bg-hex-input',
    errorId: 'theme-surface-bg-hex-error',
  },
  {
    key: 'inkPrimaryHex',
    label: 'Primary text',
    presetKey: 'inkPrimary',
    inputId: 'theme-ink-primary-hex-input',
    testId: 'theme-ink-primary-hex-input',
    errorId: 'theme-ink-primary-hex-error',
  },
  {
    key: 'inkMutedHex',
    label: 'Secondary text',
    presetKey: 'inkMuted',
    inputId: 'theme-ink-muted-hex-input',
    testId: 'theme-ink-muted-hex-input',
    errorId: 'theme-ink-muted-hex-error',
  },
  {
    key: 'borderColorHex',
    label: 'Borders & dividers',
    presetKey: 'borderColor',
    inputId: 'theme-border-color-hex-input',
    testId: 'theme-border-color-hex-input',
    errorId: 'theme-border-color-hex-error',
  },
];

export interface ThemeControlsPanelProps {
  readonly theme: WeddingThemeConfig;
  readonly canEdit: boolean;
  readonly workspaceId?: string | undefined;
  readonly weddingId?: string | undefined;
  readonly client?: TypedSupabaseClient | null | undefined;
  readonly onUpdateTheme: (
    nextTheme: WeddingThemeConfig,
    options?: { readonly immediate?: boolean | undefined },
  ) => void;
  readonly onThemeValidationIssue: (message: string | null) => void;
}

function buildCleanTokenOverrides(raw: Partial<ThemeTokenOverrides>): ThemeTokenOverrides {
  const cleaned: Record<string, unknown> = {};
  if (raw.primaryAccentHex) cleaned.primaryAccentHex = raw.primaryAccentHex;
  if (raw.canvasBgHex) cleaned.canvasBgHex = raw.canvasBgHex;
  if (raw.surfaceBgHex) cleaned.surfaceBgHex = raw.surfaceBgHex;
  if (raw.surfaceMutedBgHex) cleaned.surfaceMutedBgHex = raw.surfaceMutedBgHex;
  if (raw.inkPrimaryHex) cleaned.inkPrimaryHex = raw.inkPrimaryHex;
  if (raw.inkMutedHex) cleaned.inkMutedHex = raw.inkMutedHex;
  if (raw.borderColorHex) cleaned.borderColorHex = raw.borderColorHex;
  if (raw.surfaceTint) cleaned.surfaceTint = raw.surfaceTint;
  if (raw.headingFontPair) cleaned.headingFontPair = raw.headingFontPair;
  if (raw.bodyFontPair) cleaned.bodyFontPair = raw.bodyFontPair;
  if (raw.customFonts && raw.customFonts.length > 0) {
    cleaned.customFonts = raw.customFonts;
  }
  if (raw.headingCustomFontId) cleaned.headingCustomFontId = raw.headingCustomFontId;
  if (raw.bodyCustomFontId) cleaned.bodyCustomFontId = raw.bodyCustomFontId;
  if (raw.customFontUrl) {
    cleaned.customFontUrl = raw.customFontUrl;
    if (raw.customFontName) cleaned.customFontName = raw.customFontName;
    if (raw.customFontTarget) cleaned.customFontTarget = raw.customFontTarget;
  }
  if (raw.backgroundImageUrl) {
    cleaned.backgroundImageUrl = raw.backgroundImageUrl;
    if (typeof raw.backgroundOverlayOpacity === 'number') {
      cleaned.backgroundOverlayOpacity = raw.backgroundOverlayOpacity;
    }
  }
  if (typeof raw.cardOpacity === 'number' && raw.cardOpacity < 100) {
    cleaned.cardOpacity = raw.cardOpacity;
  }
  if (raw.animationStyle) cleaned.animationStyle = raw.animationStyle;
  if (raw.cornerStyle) cleaned.cornerStyle = raw.cornerStyle;
  if (raw.sectionSpacing) cleaned.sectionSpacing = raw.sectionSpacing;
  if (raw.ornamentStyle) cleaned.ornamentStyle = raw.ornamentStyle;
  return cleaned as ThemeTokenOverrides;
}

function generateFontId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function ThemeControlsPanel({
  theme,
  canEdit,
  workspaceId,
  weddingId,
  client,
  onUpdateTheme,
  onThemeValidationIssue,
}: ThemeControlsPanelProps): JSX.Element {
  const activePreset = WEDDING_THEME_PRESETS[theme.presetId];
  const overrides = theme.tokenOverrides;

  const [colorInputs, setColorInputs] = useState<Record<ColorOverrideKey, string>>({
    primaryAccentHex: overrides.primaryAccentHex ?? '',
    canvasBgHex: overrides.canvasBgHex ?? '',
    surfaceBgHex: overrides.surfaceBgHex ?? '',
    inkPrimaryHex: overrides.inkPrimaryHex ?? '',
    inkMutedHex: overrides.inkMutedHex ?? '',
    borderColorHex: overrides.borderColorHex ?? '',
  });
  const [colorErrors, setColorErrors] = useState<Partial<Record<ColorOverrideKey, string>>>({});

  const [bgUrlInput, setBgUrlInput] = useState<string>(overrides.backgroundImageUrl ?? '');
  const [bgUrlError, setBgUrlError] = useState<string | null>(null);
  const [bgPreviewFailed, setBgPreviewFailed] = useState(false);
  const [isUploadingBg, setIsUploadingBg] = useState(false);

  const [isUploadingFont, setIsUploadingFont] = useState(false);
  const [fontUploadError, setFontUploadError] = useState<string | null>(null);

  const bgFileInputRef = useRef<HTMLInputElement | null>(null);
  const fontFileInputRef = useRef<HTMLInputElement | null>(null);

  const hasAnyOverrides =
    Object.keys(overrides).length > 0 ||
    Object.values(colorInputs).some((v) => v.trim().length > 0) ||
    bgUrlInput.trim().length > 0;

  const syncValidationBanner = (
    nextColorErrors: Partial<Record<ColorOverrideKey, string>>,
    nextBgError: string | null,
  ) => {
    const firstError =
      Object.values(nextColorErrors).find((msg) => Boolean(msg)) ?? nextBgError ?? null;
    onThemeValidationIssue(firstError);
  };

  const handlePresetSelect = (presetId: WeddingThemePresetId) => {
    if (!canEdit || presetId === theme.presetId) {
      return;
    }
    onUpdateTheme(
      {
        ...theme,
        presetId,
      },
      { immediate: true },
    );
  };

  const applyOverridePatch = (
    patch: Partial<ThemeTokenOverrides>,
    immediate = false,
  ) => {
    if (!canEdit) {
      return;
    }
    const merged: Partial<ThemeTokenOverrides> = {
      ...overrides,
      ...patch,
    };
    const nextOverrides = buildCleanTokenOverrides(merged);
    onUpdateTheme(
      {
        ...theme,
        tokenOverrides: nextOverrides,
      },
      { immediate },
    );
  };

  const handleColorTextChange = (key: ColorOverrideKey, rawValue: string) => {
    setColorInputs((prev) => ({ ...prev, [key]: rawValue }));
    if (!canEdit) {
      return;
    }
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      const nextErrors = { ...colorErrors };
      delete nextErrors[key];
      setColorErrors(nextErrors);
      syncValidationBanner(nextErrors, bgUrlError);
      applyOverridePatch({ [key]: undefined });
      return;
    }

    const parsedHex = hexColorSchema.safeParse(trimmed);
    if (!parsedHex.success) {
      const msg =
        parsedHex.error.issues[0]?.message ?? 'Color must be a 6-digit hex code such as #9A7B4F.';
      const nextErrors = { ...colorErrors, [key]: msg };
      setColorErrors(nextErrors);
      syncValidationBanner(nextErrors, bgUrlError);
      return;
    }

    const nextErrors = { ...colorErrors };
    delete nextErrors[key];
    setColorErrors(nextErrors);
    syncValidationBanner(nextErrors, bgUrlError);
    applyOverridePatch({ [key]: parsedHex.data });
  };

  const handleBackgroundUrlTextChange = (rawValue: string) => {
    setBgUrlInput(rawValue);
    if (!canEdit) {
      return;
    }
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      setBgUrlError(null);
      syncValidationBanner(colorErrors, null);
      applyOverridePatch({
        backgroundImageUrl: undefined,
        backgroundOverlayOpacity: undefined,
      });
      return;
    }

    const parsed = httpsUrlSchema.safeParse(trimmed);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Enter a valid https:// image URL.';
      setBgUrlError(msg);
      syncValidationBanner(colorErrors, msg);
      return;
    }

    setBgUrlError(null);
    setBgPreviewFailed(false);
    syncValidationBanner(colorErrors, null);
    applyOverridePatch({
      backgroundImageUrl: parsed.data,
      backgroundOverlayOpacity:
        overrides.backgroundOverlayOpacity ?? DEFAULT_BACKGROUND_OVERLAY_OPACITY,
    });
  };

  const handleBackgroundFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canEdit) {
      return;
    }
    if (!workspaceId || !weddingId) {
      setBgUrlError('Workspace context is unavailable for file uploads.');
      return;
    }

    setIsUploadingBg(true);
    setBgUrlError(null);
    try {
      const uploaded = await uploadWeddingDesignAsset(
        {
          workspaceId,
          weddingId,
          category: 'backgrounds',
          file,
        },
        client,
      );
      setBgUrlInput(uploaded.publicUrl);
      setBgPreviewFailed(false);
      syncValidationBanner(colorErrors, null);
      applyOverridePatch(
        {
          backgroundImageUrl: uploaded.publicUrl,
          backgroundOverlayOpacity:
            overrides.backgroundOverlayOpacity ?? DEFAULT_BACKGROUND_OVERLAY_OPACITY,
        },
        true,
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to upload background image.';
      setBgUrlError(message);
    } finally {
      setIsUploadingBg(false);
    }
  };

  const handleRemoveBackgroundImage = () => {
    if (!canEdit) {
      return;
    }
    setBgUrlInput('');
    setBgUrlError(null);
    setBgPreviewFailed(false);
    syncValidationBanner(colorErrors, null);
    applyOverridePatch(
      {
        backgroundImageUrl: undefined,
        backgroundOverlayOpacity: undefined,
      },
      true,
    );
  };

  const fontLibrary = getNormalizedCustomFonts(overrides);

  const resolvedHeadingSelectValue = (() => {
    if (overrides.headingCustomFontId) {
      return `custom:${overrides.headingCustomFontId}`;
    }
    if (
      !overrides.headingFontPair &&
      overrides.customFontUrl &&
      (overrides.customFontTarget === undefined ||
        overrides.customFontTarget === 'heading' ||
        overrides.customFontTarget === 'both')
    ) {
      const legacyMatch = fontLibrary.find((f) => f.url === overrides.customFontUrl);
      if (legacyMatch) {
        return `custom:${legacyMatch.id}`;
      }
    }
    return overrides.headingFontPair ?? '';
  })();

  const resolvedBodySelectValue = (() => {
    if (overrides.bodyCustomFontId) {
      return `custom:${overrides.bodyCustomFontId}`;
    }
    if (
      !overrides.bodyFontPair &&
      overrides.customFontUrl &&
      (overrides.customFontTarget === 'body' || overrides.customFontTarget === 'both')
    ) {
      const legacyMatch = fontLibrary.find((f) => f.url === overrides.customFontUrl);
      if (legacyMatch) {
        return `custom:${legacyMatch.id}`;
      }
    }
    return overrides.bodyFontPair ?? '';
  })();

  const buildMigratedLibraryPatch = (
    nextFonts: CustomFontAsset[],
    extra: Partial<ThemeTokenOverrides> = {},
  ): Partial<ThemeTokenOverrides> => ({
    customFonts: nextFonts,
    // Clear legacy single-slot fields once represented in `customFonts`
    customFontName: undefined,
    customFontUrl: undefined,
    customFontTarget: undefined,
    ...extra,
  });

  const handleGlobalHeadingFontChange = (value: string) => {
    if (!canEdit) {
      return;
    }
    const migratedFonts = [...fontLibrary];
    const extra: Partial<ThemeTokenOverrides> = {};
    if (value.startsWith('custom:')) {
      extra.headingCustomFontId = value.slice('custom:'.length);
      extra.headingFontPair = undefined;
    } else {
      extra.headingCustomFontId = undefined;
      extra.headingFontPair = (value || undefined) as ThemeTokenOverrides['headingFontPair'];
    }
    // Preserve body selection if legacy font was active on body
    if (!overrides.bodyCustomFontId && overrides.customFontUrl && overrides.customFontTarget === 'both') {
      extra.bodyCustomFontId = LEGACY_CUSTOM_FONT_ID;
    }
    applyOverridePatch(buildMigratedLibraryPatch(migratedFonts, extra));
  };

  const handleGlobalBodyFontChange = (value: string) => {
    if (!canEdit) {
      return;
    }
    const migratedFonts = [...fontLibrary];
    const extra: Partial<ThemeTokenOverrides> = {};
    if (value.startsWith('custom:')) {
      extra.bodyCustomFontId = value.slice('custom:'.length);
      extra.bodyFontPair = undefined;
    } else {
      extra.bodyCustomFontId = undefined;
      extra.bodyFontPair = (value || undefined) as ThemeTokenOverrides['bodyFontPair'];
    }
    // Preserve heading selection if legacy font was active on heading
    if (
      !overrides.headingCustomFontId &&
      overrides.customFontUrl &&
      (overrides.customFontTarget === undefined ||
        overrides.customFontTarget === 'heading' ||
        overrides.customFontTarget === 'both')
    ) {
      extra.headingCustomFontId = LEGACY_CUSTOM_FONT_ID;
    }
    applyOverridePatch(buildMigratedLibraryPatch(migratedFonts, extra));
  };

  const handleFontFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canEdit) {
      return;
    }
    if (!workspaceId || !weddingId) {
      setFontUploadError('Workspace context is unavailable for font uploads.');
      return;
    }
    if (fontLibrary.length >= 8) {
      setFontUploadError('Maximum of 8 imported fonts reached. Remove one to import another.');
      return;
    }

    setIsUploadingFont(true);
    setFontUploadError(null);
    try {
      const uploaded = await uploadWeddingDesignAsset(
        {
          workspaceId,
          weddingId,
          category: 'fonts',
          file,
        },
        client,
      );
      const displayName = deriveFontDisplayName(uploaded.fileName);
      const newFont: CustomFontAsset = {
        id: generateFontId(),
        name: displayName,
        url: uploaded.publicUrl,
      };
      const nextFonts = [...fontLibrary, newFont];

      // Preserve any active legacy heading/body font selection during migration
      const extra: Partial<ThemeTokenOverrides> = {};
      if (
        !overrides.headingCustomFontId &&
        overrides.customFontUrl &&
        (overrides.customFontTarget === undefined ||
          overrides.customFontTarget === 'heading' ||
          overrides.customFontTarget === 'both')
      ) {
        extra.headingCustomFontId = LEGACY_CUSTOM_FONT_ID;
      }
      if (
        !overrides.bodyCustomFontId &&
        overrides.customFontUrl &&
        (overrides.customFontTarget === 'body' || overrides.customFontTarget === 'both')
      ) {
        extra.bodyCustomFontId = LEGACY_CUSTOM_FONT_ID;
      }

      applyOverridePatch(buildMigratedLibraryPatch(nextFonts, extra), true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to upload font file.';
      setFontUploadError(message);
    } finally {
      setIsUploadingFont(false);
    }
  };

  const handleRenameCustomFont = (fontId: string, nextName: string) => {
    if (!canEdit) {
      return;
    }
    const nextFonts = fontLibrary.map((f) =>
      f.id === fontId ? { ...f, name: nextName.trim() || 'Custom Font' } : f,
    );
    applyOverridePatch(buildMigratedLibraryPatch(nextFonts));
  };

  const handleRemoveCustomFont = (fontId: string) => {
    if (!canEdit) {
      return;
    }
    setFontUploadError(null);
    const nextFonts = fontLibrary.filter((f) => f.id !== fontId);
    const extra: Partial<ThemeTokenOverrides> = {};
    if (overrides.headingCustomFontId === fontId) {
      extra.headingCustomFontId = undefined;
    }
    if (overrides.bodyCustomFontId === fontId) {
      extra.bodyCustomFontId = undefined;
    }
    applyOverridePatch(buildMigratedLibraryPatch(nextFonts, extra), true);
  };

  const handleResetAllOverrides = () => {
    if (!canEdit) {
      return;
    }
    setColorInputs({
      primaryAccentHex: '',
      canvasBgHex: '',
      surfaceBgHex: '',
      inkPrimaryHex: '',
      inkMutedHex: '',
      borderColorHex: '',
    });
    setColorErrors({});
    setBgUrlInput('');
    setBgUrlError(null);
    setFontUploadError(null);
    onThemeValidationIssue(null);
    onUpdateTheme(
      {
        ...theme,
        tokenOverrides: {},
      },
      { immediate: true },
    );
  };

  const currentOverlayOpacity =
    overrides.backgroundOverlayOpacity ?? DEFAULT_BACKGROUND_OVERLAY_OPACITY;
  const photoVisibilityPercent = 100 - currentOverlayOpacity;

  return (
    <div className="space-y-6" data-testid="theme-controls-panel">
      {/* 1. Curated Theme Preset */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">1. Curated Theme Preset</h3>
          <p className="text-muted-foreground text-xs">
            Choose a foundational editorial palette, surface contrast, and typography pairing.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Builder theme preset"
          className="grid gap-2.5 sm:grid-cols-2"
        >
          {WEDDING_THEME_PRESET_LIST.map((preset) => {
            const isSelected = preset.id === theme.presetId;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!canEdit}
                onClick={() => handlePresetSelect(preset.id)}
                data-testid={`builder-theme-preset-${preset.id}`}
                className={`flex flex-col justify-between rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-primary/30 ring-2'
                    : 'hover:border-foreground/30'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1" aria-hidden="true">
                      <span
                        className="inline-block size-3.5 rounded-full border"
                        style={{
                          backgroundColor: preset.canvasBg,
                          borderColor: preset.borderColor,
                        }}
                      />
                      <span
                        className="inline-block size-3.5 rounded-full border"
                        style={{
                          backgroundColor: preset.accentHex,
                          borderColor: preset.borderColor,
                        }}
                      />
                      <span
                        className="inline-block size-3.5 rounded-full border"
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
                  <p className="text-sm font-semibold">{preset.name}</p>
                  <p className="text-muted-foreground text-xs leading-snug">{preset.tagline}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Customizable Color Theme */}
      <div className="space-y-4 border-t pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">2. Custom Color Theme</h3>
            <p className="text-muted-foreground text-xs">
              Override any palette color with a color picker or 6-digit hex code.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || !hasAnyOverrides}
            data-testid="reset-theme-overrides-button"
            onClick={handleResetAllOverrides}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reset overrides
          </Button>
        </div>

        {/* Primary Accent with Picker + Swatches */}
        <div className="space-y-2">
          <Label htmlFor="theme-accent-hex-input">
            Primary accent hex (preset default: {activePreset.accentHex})
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="color"
              aria-label="Pick primary accent color"
              disabled={!canEdit}
              value={overrides.primaryAccentHex ?? activePreset.accentHex}
              onChange={(e) => handleColorTextChange('primaryAccentHex', e.target.value)}
              className="h-9 w-10 cursor-pointer rounded-md border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Input
              id="theme-accent-hex-input"
              value={colorInputs.primaryAccentHex}
              placeholder={activePreset.accentHex}
              disabled={!canEdit}
              data-testid="theme-accent-hex-input"
              aria-invalid={Boolean(colorErrors.primaryAccentHex)}
              onChange={(event) => handleColorTextChange('primaryAccentHex', event.target.value)}
              className="max-w-[9.5rem] font-mono text-sm"
            />
            <div
              className="flex items-center gap-1.5"
              role="group"
              aria-label="Quick accent swatches"
            >
              {CURATED_ACCENT_SWATCHES.map((swatchHex) => (
                <button
                  key={swatchHex}
                  type="button"
                  disabled={!canEdit}
                  aria-label={`Use accent ${swatchHex}`}
                  data-testid={`theme-accent-swatch-${swatchHex.slice(1)}`}
                  onClick={() => handleColorTextChange('primaryAccentHex', swatchHex)}
                  className="size-6 rounded-full border transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: swatchHex }}
                />
              ))}
            </div>
          </div>
          <FormFieldError
            id="theme-accent-hex-error"
            message={colorErrors.primaryAccentHex ?? undefined}
          />
        </div>

        {/* Full Palette Color Grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {COLOR_FIELD_CONFIGS.map((field) => {
            const presetDefault = activePreset[field.presetKey];
            const resolvedValue = overrides[field.key] ?? presetDefault;
            const fieldError = colorErrors[field.key];
            return (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={field.inputId} className="text-xs">
                  {field.label}
                </Label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    aria-label={`Pick ${field.label.toLowerCase()} color`}
                    disabled={!canEdit}
                    value={resolvedValue}
                    onChange={(e) => handleColorTextChange(field.key, e.target.value)}
                    className="h-8 w-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Input
                    id={field.inputId}
                    value={colorInputs[field.key]}
                    placeholder={presetDefault}
                    disabled={!canEdit}
                    data-testid={field.testId}
                    aria-invalid={Boolean(fieldError)}
                    onChange={(e) => handleColorTextChange(field.key, e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <FormFieldError id={field.errorId} message={fieldError ?? undefined} />
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Typography & Font Library */}
      <div className="space-y-4 border-t pt-5">
        <div>
          <h3 className="text-sm font-semibold">3. Typography &amp; Font Library</h3>
          <p className="text-muted-foreground text-xs">
            Choose default invitation fonts or import TrueType (.ttf), OpenType (.otf), and WOFF
            files into your permanent font library. Imported fonts can also be picked per section.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="theme-heading-font-select">Default heading font</Label>
            <NativeSelect
              id="theme-heading-font-select"
              disabled={!canEdit}
              value={resolvedHeadingSelectValue}
              data-testid="theme-heading-font-select"
              onChange={(e) => handleGlobalHeadingFontChange(e.target.value)}
            >
              <option value="">Preset default ({activePreset.defaultHeadingFontPair})</option>
              {fontLibrary.length > 0 ? (
                <optgroup label="Imported Fonts">
                  {fontLibrary.map((font) => (
                    <option key={font.id} value={`custom:${font.id}`}>
                      {font.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label="Built-in Fonts">
                <option value="editorial_serif">Editorial Serif</option>
                <option value="classic_serif">Classic Serif</option>
                <option value="romantic_serif">Romantic Serif</option>
                <option value="modern_sans">Modern Sans</option>
                <option value="handwritten_script">Handwritten Script</option>
                <option value="minimal_mono">Minimal Monospace</option>
              </optgroup>
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="theme-body-font-select">Default body font</Label>
            <NativeSelect
              id="theme-body-font-select"
              disabled={!canEdit}
              value={resolvedBodySelectValue}
              data-testid="theme-body-font-select"
              onChange={(e) => handleGlobalBodyFontChange(e.target.value)}
            >
              <option value="">Preset default ({activePreset.defaultBodyFontPair})</option>
              {fontLibrary.length > 0 ? (
                <optgroup label="Imported Fonts">
                  {fontLibrary.map((font) => (
                    <option key={font.id} value={`custom:${font.id}`}>
                      {font.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label="Built-in Fonts">
                <option value="modern_sans">Modern Sans</option>
                <option value="humanist_sans">Humanist Sans</option>
                <option value="editorial_serif">Editorial Serif</option>
                <option value="classic_serif">Classic Serif</option>
                <option value="minimal_mono">Minimal Monospace</option>
              </optgroup>
            </NativeSelect>
          </div>
        </div>

        {/* Non-Destructive Imported Font Library */}
        <div className="bg-muted/20 space-y-3 rounded-lg border p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Type className="text-muted-foreground size-4" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold">
                  Imported Font Library ({fontLibrary.length}/8)
                </p>
                <p className="text-muted-foreground text-[11px]">
                  Import .ttf, .otf, .woff, or .woff2 files. They stay in all font dropdowns until
                  you remove them.
                </p>
              </div>
            </div>

            <div>
              <input
                ref={fontFileInputRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                disabled={!canEdit || isUploadingFont || fontLibrary.length >= 8}
                data-testid="theme-custom-font-file-input"
                onChange={(e) => void handleFontFileUpload(e)}
                className="sr-only"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canEdit || isUploadingFont || fontLibrary.length >= 8}
                data-testid="theme-upload-font-button"
                onClick={() => fontFileInputRef.current?.click()}
              >
                {isUploadingFont ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="size-3.5" aria-hidden="true" />
                )}
                Import font
              </Button>
            </div>
          </div>

          {fontLibrary.length > 0 ? (
            <ul className="space-y-2 pt-1" data-testid="theme-font-library-list">
              {fontLibrary.map((font, idx) => (
                <li
                  key={font.id}
                  data-testid={`theme-font-library-item-${idx}`}
                  className="bg-background flex flex-wrap items-center gap-2 rounded-md border p-2"
                >
                  <Input
                    aria-label={`Font ${idx + 1} display name`}
                    disabled={!canEdit}
                    defaultValue={font.name}
                    data-testid={`theme-custom-font-name-input-${idx}`}
                    onBlur={(e) => handleRenameCustomFont(font.id, e.target.value)}
                    className="h-7 min-w-[8rem] flex-1 text-xs"
                  />
                  <span
                    className="text-muted-foreground px-2 text-sm"
                    style={{ fontFamily: `'${buildCustomFontFamilyName(font.url)}', serif` }}
                  >
                    Aa Bb Cc
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canEdit}
                    className="text-destructive h-7 w-7 p-0"
                    aria-label={`Remove ${font.name} from font library`}
                    data-testid={`theme-remove-font-button-${idx}`}
                    onClick={() => handleRemoveCustomFont(font.id)}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <FormFieldError message={fontUploadError ?? undefined} />
        </div>
      </div>

      {/* 4. Background Media (Photo, GIF, or Motion Photo) & Transparency */}
      <div className="space-y-4 border-t pt-5">
        <div>
          <h3 className="text-sm font-semibold">4. Background Media &amp; Card Wash</h3>
          <p className="text-muted-foreground text-xs">
            Set a full-page backdrop photo, animated GIF, or live motion photo (MP4/WebM/MOV)
            surrounding the invitation canvas, and adjust backdrop &amp; card transparency.
          </p>
        </div>

        <div className="bg-muted/20 space-y-3 rounded-lg border p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ImageIcon className="text-muted-foreground size-4" aria-hidden="true" />
              <span className="text-xs font-semibold">Backdrop Photo, GIF, or Motion Video</span>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                ref={bgFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm,video/quicktime,.gif,.mp4,.webm,.mov"
                disabled={!canEdit || isUploadingBg}
                data-testid="theme-bg-image-file-input"
                onChange={(e) => void handleBackgroundFileUpload(e)}
                className="sr-only"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canEdit || isUploadingBg}
                data-testid="theme-upload-bg-image-button"
                onClick={() => bgFileInputRef.current?.click()}
              >
                {isUploadingBg ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="size-3.5" aria-hidden="true" />
                )}
                {overrides.backgroundImageUrl ? 'Change media' : 'Upload media'}
              </Button>
              {overrides.backgroundImageUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit}
                  className="text-destructive h-8 px-2"
                  aria-label="Remove background media"
                  data-testid="theme-remove-bg-image-button"
                  onClick={handleRemoveBackgroundImage}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="theme-bg-image-url-input" className="text-xs">
              Or paste a direct hosted media URL (https://*.supabase.co/…)
            </Label>
            <Input
              id="theme-bg-image-url-input"
              type="url"
              placeholder="https://…supabase.co/storage/v1/object/public/wedding-assets/…"
              disabled={!canEdit}
              value={bgUrlInput}
              data-testid="theme-bg-image-url-input"
              aria-invalid={Boolean(bgUrlError)}
              onChange={(e) => handleBackgroundUrlTextChange(e.target.value)}
              className="h-8 text-xs"
            />
            <p className="text-muted-foreground text-[11px]">
              Supports JPG, PNG, WebP, AVIF, animated GIF, and Live/Motion Photos (MP4, WebM, MOV)
              up to 50 MB via <strong>Upload media</strong>.
            </p>
            <FormFieldError id="theme-bg-image-url-error" message={bgUrlError ?? undefined} />
          </div>

          {overrides.backgroundImageUrl ? (
            <div className="space-y-3 pt-1">
              <div className="relative h-24 w-full overflow-hidden rounded-md border">
                {isVideoAssetUrl(overrides.backgroundImageUrl) ? (
                  <video
                    src={overrides.backgroundImageUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    onLoadedData={() => setBgPreviewFailed(false)}
                    onError={() => setBgPreviewFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={overrides.backgroundImageUrl}
                    alt="Invitation background preview"
                    onLoad={() => setBgPreviewFailed(false)}
                    onError={() => setBgPreviewFailed(true)}
                    className="h-full w-full object-cover"
                  />
                )}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundColor: overrides.canvasBgHex ?? activePreset.canvasBg,
                    opacity: currentOverlayOpacity / 100,
                  }}
                />
              </div>

              {bgPreviewFailed ? (
                <p
                  role="alert"
                  className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-2.5 py-2 text-xs"
                >
                  This media URL could not be loaded. External hosts and webpage share links (like
                  Google Photos) are blocked by browser Content-Security-Policy. Download the file
                  and use <strong>Upload media</strong> instead.
                </p>
              ) : null}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <Label htmlFor="theme-bg-opacity-slider">
                    Backdrop transparency / wash
                  </Label>
                  <span
                    className="text-muted-foreground font-mono text-[11px]"
                    data-testid="theme-bg-opacity-readout"
                  >
                    Overlay {currentOverlayOpacity}% · Media {photoVisibilityPercent}%
                  </span>
                </div>
                <input
                  id="theme-bg-opacity-slider"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  disabled={!canEdit}
                  value={currentOverlayOpacity}
                  data-testid="theme-bg-opacity-slider"
                  onChange={(e) =>
                    applyOverridePatch({
                      backgroundOverlayOpacity: Number.parseInt(e.target.value, 10),
                    })
                  }
                  className="accent-primary w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                />
                <div className="text-muted-foreground flex justify-between text-[10px]">
                  <span>0% (Vivid media)</span>
                  <span>50% (Balanced)</span>
                  <span>100% (Solid wash)</span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Global Section Card Transparency / Wash */}
          <div className="space-y-1.5 border-t pt-3">
            <div className="flex items-center justify-between text-xs">
              <Label htmlFor="theme-card-opacity-slider">
                Invitation &amp; section card opacity
              </Label>
              <span
                className="text-muted-foreground font-mono text-[11px]"
                data-testid="theme-card-opacity-readout"
              >
                {overrides.cardOpacity ?? DEFAULT_CARD_OPACITY}%
              </span>
            </div>
            <input
              id="theme-card-opacity-slider"
              type="range"
              min={10}
              max={100}
              step={1}
              disabled={!canEdit}
              value={overrides.cardOpacity ?? DEFAULT_CARD_OPACITY}
              data-testid="theme-card-opacity-slider"
              onChange={(e) => {
                const nextOpacity = Number.parseInt(e.target.value, 10);
                applyOverridePatch({
                  cardOpacity: nextOpacity >= 100 ? undefined : nextOpacity,
                });
              }}
              className="accent-primary w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="text-muted-foreground flex justify-between text-[10px]">
              <span>10% (Frosted glass)</span>
              <span>75% (Washed out)</span>
              <span>100% (Solid card)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Surface, Corners, Spacing, Animations & Ornaments */}
      <div className="space-y-4 border-t pt-5">
        <div>
          <h3 className="text-sm font-semibold">5. Surfaces, Corners, Animations &amp; Ornaments</h3>
          <p className="text-muted-foreground text-xs">
            Fine-tune card geometry, vertical spacing, entrance animations, and editorial dividers.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="theme-animation-style-select">Invitation animation style</Label>
            <NativeSelect
              id="theme-animation-style-select"
              disabled={!canEdit}
              value={overrides.animationStyle ?? ''}
              data-testid="theme-animation-style-select"
              onChange={(e) =>
                applyOverridePatch({
                  animationStyle: (e.target.value || undefined) as ThemeTokenOverrides['animationStyle'],
                })
              }
            >
              <option value="">Default (Editorial Rise)</option>
              <option value="editorial_rise">Editorial Rise (staggered upward glide)</option>
              <option value="gentle_fade">Gentle Fade (soft opacity reveal)</option>
              <option value="romantic_float">Romantic Float (bloom + floating accents)</option>
              <option value="none">None (static)</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="theme-surface-tint-select">Canvas surface tint</Label>
            <NativeSelect
              id="theme-surface-tint-select"
              disabled={!canEdit}
              value={overrides.surfaceTint ?? ''}
              data-testid="theme-surface-tint-select"
              onChange={(e) =>
                applyOverridePatch({
                  surfaceTint: (e.target.value || undefined) as ThemeTokenOverrides['surfaceTint'],
                })
              }
            >
              <option value="">Preset default</option>
              <option value="warm">Warm Paper (#FDF8F0)</option>
              <option value="cool">Cool Mist (#F4F7F9)</option>
              <option value="high_contrast">Crisp White (#FFFFFF)</option>
            </NativeSelect>
            {activePreset.isDarkSurface && !overrides.canvasBgHex ? (
              <p className="text-muted-foreground text-[11px]">
                Dark-surface themes preserve their deep navy canvas unless you set a custom canvas
                color above.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="theme-corner-style-select">Card corner style</Label>
            <NativeSelect
              id="theme-corner-style-select"
              disabled={!canEdit}
              value={overrides.cornerStyle ?? ''}
              data-testid="theme-corner-style-select"
              onChange={(e) =>
                applyOverridePatch({
                  cornerStyle: (e.target.value || undefined) as ThemeTokenOverrides['cornerStyle'],
                })
              }
            >
              <option value="">Preset default ({activePreset.defaultCornerStyle})</option>
              <option value="sharp">Sharp gallery corners</option>
              <option value="soft">Soft rounded corners</option>
              <option value="arch">Sculpted arch framing</option>
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="theme-section-spacing-select">Vertical section rhythm</Label>
            <NativeSelect
              id="theme-section-spacing-select"
              disabled={!canEdit}
              value={overrides.sectionSpacing ?? ''}
              data-testid="theme-section-spacing-select"
              onChange={(e) =>
                applyOverridePatch({
                  sectionSpacing: (e.target.value || undefined) as ThemeTokenOverrides['sectionSpacing'],
                })
              }
            >
              <option value="">Preset default ({activePreset.defaultSectionSpacing})</option>
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="airy">Airy gallery</option>
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="theme-ornament-style-select">Section divider ornament</Label>
            <NativeSelect
              id="theme-ornament-style-select"
              disabled={!canEdit}
              value={overrides.ornamentStyle ?? ''}
              data-testid="theme-ornament-style-select"
              onChange={(e) =>
                applyOverridePatch({
                  ornamentStyle: (e.target.value || undefined) as ThemeTokenOverrides['ornamentStyle'],
                })
              }
            >
              <option value="">Preset default ({activePreset.defaultOrnamentStyle})</option>
              <option value="minimal_line">Minimal diamond hairline</option>
              <option value="botanical_flourish">Botanical flourish</option>
              <option value="monogram_crest">Monogram crest</option>
              <option value="none">None</option>
            </NativeSelect>
          </div>
        </div>
      </div>
    </div>
  );
}
