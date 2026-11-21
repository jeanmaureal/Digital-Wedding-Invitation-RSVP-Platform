import { ChevronDown, ChevronUp, Palette, RotateCcw } from 'lucide-react';
import { type JSX, useState } from 'react';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  type CardBorderStyleId,
  type CardTextureId,
  type CustomFontAsset,
  type ElementMotionStyle,
  hexColorSchema,
  type SectionFontScale,
  type SectionStyleOverrides,
} from '@/features/design/schemas/designSchemas';
import { ALL_BUILTIN_FONT_OPTIONS } from '@/features/design/themes/themePresets';

type SectionColorKey =
  | 'backgroundBgHex'
  | 'surfaceBgHex'
  | 'inkPrimaryHex'
  | 'inkMutedHex'
  | 'accentHex';

const SECTION_COLOR_FIELDS: ReadonlyArray<{
  readonly key: SectionColorKey;
  readonly label: string;
  readonly placeholder: string;
}> = [
  { key: 'backgroundBgHex', label: 'Section background', placeholder: '#FFFFFF' },
  { key: 'surfaceBgHex', label: 'Card surface', placeholder: '#FCFDFB' },
  { key: 'inkPrimaryHex', label: 'Heading & primary text', placeholder: '#1E2D24' },
  { key: 'inkMutedHex', label: 'Body & muted text', placeholder: '#516357' },
  { key: 'accentHex', label: 'Accent color', placeholder: '#4F6F58' },
];

export interface SectionStyleControlsProps {
  readonly sectionType: string;
  readonly style: SectionStyleOverrides | undefined;
  readonly customFonts: readonly CustomFontAsset[];
  readonly canEdit: boolean;
  readonly onChangeStyle: (nextStyle: SectionStyleOverrides | undefined) => void;
  readonly onValidationIssue: (message: string | null) => void;
}

function cleanSectionStyle(
  raw: Partial<SectionStyleOverrides>,
): SectionStyleOverrides | undefined {
  const cleaned: Record<string, string | number> = {};
  if (raw.backgroundBgHex) cleaned.backgroundBgHex = raw.backgroundBgHex;
  if (raw.surfaceBgHex) cleaned.surfaceBgHex = raw.surfaceBgHex;
  if (raw.inkPrimaryHex) cleaned.inkPrimaryHex = raw.inkPrimaryHex;
  if (raw.inkMutedHex) cleaned.inkMutedHex = raw.inkMutedHex;
  if (raw.accentHex) cleaned.accentHex = raw.accentHex;
  if (typeof raw.cardOpacity === 'number' && raw.cardOpacity < 100) {
    cleaned.cardOpacity = raw.cardOpacity;
  }
  if (raw.cardBorderStyle) cleaned.cardBorderStyle = raw.cardBorderStyle;
  if (raw.cardTexture) cleaned.cardTexture = raw.cardTexture;
  if (raw.textMotion) cleaned.textMotion = raw.textMotion;
  if (raw.cardMotion) cleaned.cardMotion = raw.cardMotion;
  if (raw.featureMotion) cleaned.featureMotion = raw.featureMotion;
  if (raw.headingFont) cleaned.headingFont = raw.headingFont;
  if (raw.bodyFont) cleaned.bodyFont = raw.bodyFont;
  if (raw.headingSize && raw.headingSize !== 'md') cleaned.headingSize = raw.headingSize;
  if (raw.bodySize && raw.bodySize !== 'md') cleaned.bodySize = raw.bodySize;

  return Object.keys(cleaned).length > 0 ? (cleaned as SectionStyleOverrides) : undefined;
}

export function SectionStyleControls({
  sectionType,
  style,
  customFonts,
  canEdit,
  onChangeStyle,
  onValidationIssue,
}: SectionStyleControlsProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [colorInputs, setColorInputs] = useState<Record<SectionColorKey, string>>({
    backgroundBgHex: style?.backgroundBgHex ?? '',
    surfaceBgHex: style?.surfaceBgHex ?? '',
    inkPrimaryHex: style?.inkPrimaryHex ?? '',
    inkMutedHex: style?.inkMutedHex ?? '',
    accentHex: style?.accentHex ?? '',
  });
  const [colorErrors, setColorErrors] = useState<Partial<Record<SectionColorKey, string>>>({});

  const activeOverrideCount = style ? Object.keys(style).length : 0;

  const applyPatch = (patch: Partial<SectionStyleOverrides>) => {
    if (!canEdit) {
      return;
    }
    const merged: Partial<SectionStyleOverrides> = {
      ...(style ?? {}),
      ...patch,
    };
    onChangeStyle(cleanSectionStyle(merged));
  };

  const handleColorChange = (key: SectionColorKey, rawValue: string) => {
    setColorInputs((prev) => ({ ...prev, [key]: rawValue }));
    if (!canEdit) {
      return;
    }
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      const nextErrors = { ...colorErrors };
      delete nextErrors[key];
      setColorErrors(nextErrors);
      onValidationIssue(Object.values(nextErrors)[0] ?? null);
      applyPatch({ [key]: undefined });
      return;
    }

    const parsed = hexColorSchema.safeParse(trimmed);
    if (!parsed.success) {
      const msg =
        parsed.error.issues[0]?.message ?? 'Color must be a 6-digit hex code such as #9A7B4F.';
      const nextErrors = { ...colorErrors, [key]: msg };
      setColorErrors(nextErrors);
      onValidationIssue(msg);
      return;
    }

    const nextErrors = { ...colorErrors };
    delete nextErrors[key];
    setColorErrors(nextErrors);
    onValidationIssue(Object.values(nextErrors)[0] ?? null);
    applyPatch({ [key]: parsed.data });
  };

  const handleResetSectionStyle = () => {
    if (!canEdit) {
      return;
    }
    setColorInputs({
      backgroundBgHex: '',
      surfaceBgHex: '',
      inkPrimaryHex: '',
      inkMutedHex: '',
      accentHex: '',
    });
    setColorErrors({});
    onValidationIssue(null);
    onChangeStyle(undefined);
  };

  return (
    <div
      className="bg-muted/20 rounded-lg border"
      data-testid={`section-style-controls-${sectionType}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        data-testid={`section-style-toggle-${sectionType}`}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold transition-colors hover:bg-muted/40"
      >
          <span className="flex flex-wrap items-center gap-2">
          <Palette className="text-muted-foreground size-3.5" aria-hidden="true" />
          <span>Section Canvas Style (Colors, Borders, Motion, Font &amp; Size)</span>
          {activeOverrideCount > 0 ? (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {activeOverrideCount} custom
            </Badge>
          ) : null}
          {customFonts.length > 0 ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {customFonts.length} imported {customFonts.length === 1 ? 'font' : 'fonts'}
            </Badge>
          ) : null}
        </span>
        {isOpen ? (
          <ChevronUp className="text-muted-foreground size-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="text-muted-foreground size-4" aria-hidden="true" />
        )}
      </button>

      {isOpen ? (
        <div className="space-y-4 border-t p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-[11px]">
              Customize this section independently from the global theme.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canEdit || activeOverrideCount === 0}
              data-testid={`section-style-reset-${sectionType}`}
              onClick={handleResetSectionStyle}
              className="h-7 px-2 text-xs"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              Reset style
            </Button>
          </div>

          {/* Per-Section Typography & Size */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`sec-heading-font-${sectionType}`} className="text-xs">
                Heading font
              </Label>
              <NativeSelect
                id={`sec-heading-font-${sectionType}`}
                disabled={!canEdit}
                value={style?.headingFont ?? ''}
                data-testid={`section-heading-font-select-${sectionType}`}
                onChange={(e) =>
                  applyPatch({
                    headingFont: e.target.value || undefined,
                  })
                }
                className="h-8 text-xs"
              >
                <option value="">Theme default</option>
                {customFonts.length > 0 ? (
                  <optgroup label="Imported Fonts">
                    {customFonts.map((font) => (
                      <option key={font.id} value={`custom:${font.id}`}>
                        {font.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label="Built-in Fonts">
                  {ALL_BUILTIN_FONT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              </NativeSelect>
            </div>

            <div className="space-y-1">
              <Label htmlFor={`sec-heading-size-${sectionType}`} className="text-xs">
                Heading size
              </Label>
              <NativeSelect
                id={`sec-heading-size-${sectionType}`}
                disabled={!canEdit}
                value={style?.headingSize ?? 'md'}
                data-testid={`section-heading-size-select-${sectionType}`}
                onChange={(e) =>
                  applyPatch({
                    headingSize:
                      e.target.value === 'md'
                        ? undefined
                        : (e.target.value as SectionFontScale),
                  })
                }
                className="h-8 text-xs"
              >
                <option value="xs">Extra Small</option>
                <option value="sm">Small</option>
                <option value="md">Default (Medium)</option>
                <option value="lg">Large</option>
                <option value="xl">Extra Large</option>
              </NativeSelect>
            </div>

            <div className="space-y-1">
              <Label htmlFor={`sec-body-font-${sectionType}`} className="text-xs">
                Body font
              </Label>
              <NativeSelect
                id={`sec-body-font-${sectionType}`}
                disabled={!canEdit}
                value={style?.bodyFont ?? ''}
                data-testid={`section-body-font-select-${sectionType}`}
                onChange={(e) =>
                  applyPatch({
                    bodyFont: e.target.value || undefined,
                  })
                }
                className="h-8 text-xs"
              >
                <option value="">Theme default</option>
                {customFonts.length > 0 ? (
                  <optgroup label="Imported Fonts">
                    {customFonts.map((font) => (
                      <option key={font.id} value={`custom:${font.id}`}>
                        {font.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label="Built-in Fonts">
                  {ALL_BUILTIN_FONT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              </NativeSelect>
            </div>

            <div className="space-y-1">
              <Label htmlFor={`sec-body-size-${sectionType}`} className="text-xs">
                Body text size
              </Label>
              <NativeSelect
                id={`sec-body-size-${sectionType}`}
                disabled={!canEdit}
                value={style?.bodySize ?? 'md'}
                data-testid={`section-body-size-select-${sectionType}`}
                onChange={(e) =>
                  applyPatch({
                    bodySize:
                      e.target.value === 'md'
                        ? undefined
                        : (e.target.value as SectionFontScale),
                  })
                }
                className="h-8 text-xs"
              >
                <option value="xs">Extra Small</option>
                <option value="sm">Small</option>
                <option value="md">Default (Medium)</option>
                <option value="lg">Large</option>
                <option value="xl">Extra Large</option>
              </NativeSelect>
            </div>
          </div>

          {/* Per-Section Card Wash / Transparency */}
          <div className="space-y-1.5 border-t pt-3">
            <div className="flex items-center justify-between text-xs">
              <Label htmlFor={`sec-card-opacity-${sectionType}`}>
                Section card wash / transparency
              </Label>
              <span className="text-muted-foreground font-mono text-[11px]">
                {style?.cardOpacity ?? 100}%
              </span>
            </div>
            <input
              id={`sec-card-opacity-${sectionType}`}
              type="range"
              min={10}
              max={100}
              step={1}
              disabled={!canEdit}
              value={style?.cardOpacity ?? 100}
              data-testid={`section-card-opacity-slider-${sectionType}`}
              onChange={(e) => {
                const val = Number.parseInt(e.target.value, 10);
                applyPatch({ cardOpacity: val >= 100 ? undefined : val });
              }}
              className="accent-primary w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="text-muted-foreground flex justify-between text-[10px]">
              <span>10% (Frosted glass)</span>
              <span>70% (Washed out)</span>
              <span>100% (Solid)</span>
            </div>
          </div>

          {/* Per-Section Card Border, Paper Texture & Scroll Motion Controls */}
          <div className="space-y-3 border-t pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`sec-card-border-${sectionType}`} className="text-xs">
                  Card type &amp; border
                </Label>
                <NativeSelect
                  id={`sec-card-border-${sectionType}`}
                  disabled={!canEdit}
                  value={style?.cardBorderStyle ?? ''}
                  data-testid={`section-card-border-select-${sectionType}`}
                  onChange={(e) =>
                    applyPatch({
                      cardBorderStyle: (e.target.value || undefined) as
                        | CardBorderStyleId
                        | undefined,
                    })
                  }
                  className="h-8 text-xs"
                >
                  <option value="">Theme default</option>
                  <option value="classic">Classic hairline</option>
                  <option value="none">Borderless (clean)</option>
                  <option value="elevated_shadow">Floating soft shadow</option>
                  <option value="glass_frosted">Frosted glass</option>
                  <option value="double">Double stationery frame</option>
                  <option value="dashed">Dashed editorial border</option>
                  <option value="gold_foil">Foil inner-frame border</option>
                  <option value="corner_brackets">Ornate corner brackets</option>
                  <option value="corner_accent">Top &amp; bottom accent bars</option>
                  <option value="side_ribbon">Editorial left accent ribbon</option>
                  <option value="letterpress">Vintage letterpress mat</option>
                  <option value="minimal_underline">Minimalist underline</option>
                </NativeSelect>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`sec-card-texture-${sectionType}`} className="text-xs">
                  Paper texture &amp; textile
                </Label>
                <NativeSelect
                  id={`sec-card-texture-${sectionType}`}
                  disabled={!canEdit}
                  value={style?.cardTexture ?? ''}
                  data-testid={`section-card-texture-select-${sectionType}`}
                  onChange={(e) =>
                    applyPatch({
                      cardTexture: (e.target.value || undefined) as CardTextureId | undefined,
                    })
                  }
                  className="h-8 text-xs"
                >
                  <option value="">Theme default</option>
                  <option value="none">Smooth matte</option>
                  <option value="cotton_paper">Cotton rag paper</option>
                  <option value="linen_weave">Woven linen textile</option>
                  <option value="laid_stationery">Classic laid stationery</option>
                  <option value="parchment">Handmade parchment</option>
                  <option value="silk_sheen">Brushed silk satin</option>
                  <option value="watercolor_wash">Soft watercolor wash</option>
                  <option value="velvet_suede">Velvet / fine suede</option>
                </NativeSelect>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor={`sec-text-motion-${sectionType}`} className="text-xs">
                  Text motion
                </Label>
                <NativeSelect
                  id={`sec-text-motion-${sectionType}`}
                  disabled={!canEdit}
                  value={style?.textMotion ?? ''}
                  data-testid={`section-text-motion-select-${sectionType}`}
                  onChange={(e) =>
                    applyPatch({
                      textMotion: (e.target.value || undefined) as ElementMotionStyle | undefined,
                    })
                  }
                  className="h-8 text-xs"
                >
                  <option value="">Theme default</option>
                  <option value="none">None</option>
                  <option value="fade">Soft fade</option>
                  <option value="rise">Glide up</option>
                  <option value="slide_left">Slide from left</option>
                  <option value="slide_right">Slide from right</option>
                  <option value="zoom_soft">Soft zoom</option>
                </NativeSelect>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`sec-card-motion-${sectionType}`} className="text-xs">
                  Card motion
                </Label>
                <NativeSelect
                  id={`sec-card-motion-${sectionType}`}
                  disabled={!canEdit}
                  value={style?.cardMotion ?? ''}
                  data-testid={`section-card-motion-select-${sectionType}`}
                  onChange={(e) =>
                    applyPatch({
                      cardMotion: (e.target.value || undefined) as ElementMotionStyle | undefined,
                    })
                  }
                  className="h-8 text-xs"
                >
                  <option value="">Theme default</option>
                  <option value="none">None</option>
                  <option value="fade">Soft fade</option>
                  <option value="rise">Glide up</option>
                  <option value="slide_left">Slide from left</option>
                  <option value="slide_right">Slide from right</option>
                  <option value="zoom_soft">Soft zoom</option>
                </NativeSelect>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`sec-feature-motion-${sectionType}`} className="text-xs">
                  Photos &amp; CTA
                </Label>
                <NativeSelect
                  id={`sec-feature-motion-${sectionType}`}
                  disabled={!canEdit}
                  value={style?.featureMotion ?? ''}
                  data-testid={`section-feature-motion-select-${sectionType}`}
                  onChange={(e) =>
                    applyPatch({
                      featureMotion: (e.target.value || undefined) as
                        | ElementMotionStyle
                        | undefined,
                    })
                  }
                  className="h-8 text-xs"
                >
                  <option value="">Theme default</option>
                  <option value="none">None</option>
                  <option value="fade">Soft fade</option>
                  <option value="rise">Glide up</option>
                  <option value="slide_left">Slide from left</option>
                  <option value="slide_right">Slide from right</option>
                  <option value="zoom_soft">Soft zoom</option>
                  <option value="float">Gentle float</option>
                </NativeSelect>
              </div>
            </div>
          </div>

          {/* Per-Section Colors */}
          <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
            {SECTION_COLOR_FIELDS.map((field) => {
              const value = colorInputs[field.key];
              const pickerValue = style?.[field.key] ?? field.placeholder;
              const fieldError = colorErrors[field.key];
              return (
                <div key={field.key} className="space-y-1">
                  <Label htmlFor={`sec-${sectionType}-${field.key}`} className="text-xs">
                    {field.label}
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      aria-label={`Pick ${field.label.toLowerCase()} for ${sectionType}`}
                      disabled={!canEdit}
                      value={pickerValue}
                      onChange={(e) => handleColorChange(field.key, e.target.value)}
                      className="h-8 w-8 shrink-0 cursor-pointer rounded border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <Input
                      id={`sec-${sectionType}-${field.key}`}
                      value={value}
                      placeholder="Theme default"
                      disabled={!canEdit}
                      data-testid={`section-color-${sectionType}-${field.key}`}
                      aria-invalid={Boolean(fieldError)}
                      onChange={(e) => handleColorChange(field.key, e.target.value)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <FormFieldError message={fieldError} />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
