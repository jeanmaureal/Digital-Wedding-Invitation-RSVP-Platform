import { ChevronDown, ChevronUp, Palette, RotateCcw } from 'lucide-react';
import { type JSX, useState } from 'react';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  type CustomFontAsset,
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
  const cleaned: Record<string, string> = {};
  if (raw.backgroundBgHex) cleaned.backgroundBgHex = raw.backgroundBgHex;
  if (raw.surfaceBgHex) cleaned.surfaceBgHex = raw.surfaceBgHex;
  if (raw.inkPrimaryHex) cleaned.inkPrimaryHex = raw.inkPrimaryHex;
  if (raw.inkMutedHex) cleaned.inkMutedHex = raw.inkMutedHex;
  if (raw.accentHex) cleaned.accentHex = raw.accentHex;
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
        <span className="flex items-center gap-2">
          <Palette className="text-muted-foreground size-3.5" aria-hidden="true" />
          <span>Section Canvas Style (Colors, Font &amp; Size)</span>
          {activeOverrideCount > 0 ? (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {activeOverrideCount} custom
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
