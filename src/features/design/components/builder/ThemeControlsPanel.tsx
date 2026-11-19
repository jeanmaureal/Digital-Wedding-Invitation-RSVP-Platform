import { Check, RotateCcw } from 'lucide-react';
import { type JSX, useState } from 'react';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  hexColorSchema,
  type ThemeTokenOverrides,
  type WeddingThemeConfig,
  type WeddingThemePresetId,
} from '@/features/design/schemas/designSchemas';
import {
  WEDDING_THEME_PRESET_LIST,
  WEDDING_THEME_PRESETS,
} from '@/features/design/themes/themePresets';

const CURATED_ACCENT_SWATCHES = [
  '#9A7B4F',
  '#4F6F58',
  '#C8A45D',
  '#B85D43',
  '#8C3B2B',
  '#2E4A62',
] as const;

export interface ThemeControlsPanelProps {
  readonly theme: WeddingThemeConfig;
  readonly canEdit: boolean;
  readonly onUpdateTheme: (
    nextTheme: WeddingThemeConfig,
    options?: { readonly immediate?: boolean | undefined },
  ) => void;
  readonly onThemeValidationIssue: (message: string | null) => void;
}

function buildCleanTokenOverrides(raw: ThemeTokenOverrides): ThemeTokenOverrides {
  const cleaned: Record<string, string> = {};
  if (raw.primaryAccentHex) cleaned.primaryAccentHex = raw.primaryAccentHex;
  if (raw.surfaceTint) cleaned.surfaceTint = raw.surfaceTint;
  if (raw.headingFontPair) cleaned.headingFontPair = raw.headingFontPair;
  if (raw.cornerStyle) cleaned.cornerStyle = raw.cornerStyle;
  if (raw.sectionSpacing) cleaned.sectionSpacing = raw.sectionSpacing;
  if (raw.ornamentStyle) cleaned.ornamentStyle = raw.ornamentStyle;
  return cleaned as ThemeTokenOverrides;
}

export function ThemeControlsPanel({
  theme,
  canEdit,
  onUpdateTheme,
  onThemeValidationIssue,
}: ThemeControlsPanelProps): JSX.Element {
  const activePreset = WEDDING_THEME_PRESETS[theme.presetId];
  const overrides = theme.tokenOverrides;

  const [accentInput, setAccentInput] = useState<string>(overrides.primaryAccentHex ?? '');
  const [accentError, setAccentError] = useState<string | null>(null);

  const hasAnyOverrides = Object.keys(overrides).length > 0 || accentInput.trim().length > 0;

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
    patch: Partial<Record<keyof ThemeTokenOverrides, string | undefined>>,
    immediate = false,
  ) => {
    if (!canEdit) {
      return;
    }
    const merged: Record<string, string | undefined> = {
      ...overrides,
      ...patch,
    };
    const nextOverrides = buildCleanTokenOverrides(merged as ThemeTokenOverrides);
    onUpdateTheme(
      {
        ...theme,
        tokenOverrides: nextOverrides,
      },
      { immediate },
    );
  };

  const handleAccentTextChange = (rawValue: string) => {
    setAccentInput(rawValue);
    if (!canEdit) {
      return;
    }
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      setAccentError(null);
      onThemeValidationIssue(null);
      applyOverridePatch({ primaryAccentHex: undefined });
      return;
    }

    const parsedHex = hexColorSchema.safeParse(trimmed);
    if (!parsedHex.success) {
      const msg =
        parsedHex.error.issues[0]?.message ?? 'Color must be a 6-digit hex code such as #9A7B4F.';
      setAccentError(msg);
      onThemeValidationIssue(msg);
      return;
    }

    setAccentError(null);
    onThemeValidationIssue(null);
    applyOverridePatch({ primaryAccentHex: parsedHex.data });
  };

  const handleResetAllOverrides = () => {
    if (!canEdit) {
      return;
    }
    setAccentInput('');
    setAccentError(null);
    onThemeValidationIssue(null);
    onUpdateTheme(
      {
        ...theme,
        tokenOverrides: {},
      },
      { immediate: true },
    );
  };

  return (
    <div className="space-y-6" data-testid="theme-controls-panel">
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

      <div className="space-y-4 border-t pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">2. Fine-Tune Theme Tokens</h3>
            <p className="text-muted-foreground text-xs">
              Customize accent color, display typography, card corners, spacing, and dividers.
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

        <div className="space-y-2">
          <Label htmlFor="theme-accent-hex-input">
            Primary accent hex (preset default: {activePreset.accentHex})
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="theme-accent-hex-input"
              value={accentInput}
              placeholder={activePreset.accentHex}
              disabled={!canEdit}
              data-testid="theme-accent-hex-input"
              aria-invalid={Boolean(accentError)}
              onChange={(event) => handleAccentTextChange(event.target.value)}
              className="max-w-[11rem] font-mono text-sm"
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
                  onClick={() => handleAccentTextChange(swatchHex)}
                  className="size-6 rounded-full border transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: swatchHex }}
                />
              ))}
            </div>
          </div>
          <FormFieldError id="theme-accent-hex-error" message={accentError ?? undefined} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="theme-heading-font-select">Heading typography</Label>
            <NativeSelect
              id="theme-heading-font-select"
              disabled={!canEdit}
              value={overrides.headingFontPair ?? ''}
              data-testid="theme-heading-font-select"
              onChange={(e) =>
                applyOverridePatch({
                  headingFontPair: e.target.value || undefined,
                })
              }
            >
              <option value="">Preset default ({activePreset.defaultHeadingFontPair})</option>
              <option value="editorial_serif">Editorial Serif</option>
              <option value="classic_serif">Classic Serif</option>
              <option value="romantic_serif">Romantic Serif</option>
              <option value="modern_sans">Modern Sans</option>
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
                  surfaceTint: e.target.value || undefined,
                })
              }
            >
              <option value="">Preset default</option>
              <option value="warm">Warm Paper (#FDF8F0)</option>
              <option value="cool">Cool Mist (#F4F7F9)</option>
              <option value="high_contrast">Crisp White (#FFFFFF)</option>
            </NativeSelect>
            {activePreset.isDarkSurface ? (
              <p className="text-muted-foreground text-[11px]">
                Dark-surface themes preserve their deep navy canvas for legibility.
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
                  cornerStyle: e.target.value || undefined,
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
                  sectionSpacing: e.target.value || undefined,
                })
              }
            >
              <option value="">Preset default ({activePreset.defaultSectionSpacing})</option>
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="airy">Airy gallery</option>
            </NativeSelect>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="theme-ornament-style-select">Section divider ornament</Label>
            <NativeSelect
              id="theme-ornament-style-select"
              disabled={!canEdit}
              value={overrides.ornamentStyle ?? ''}
              data-testid="theme-ornament-style-select"
              onChange={(e) =>
                applyOverridePatch({
                  ornamentStyle: e.target.value || undefined,
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
