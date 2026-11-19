import type { CSSProperties } from 'react';
import type {
  ThemeTokenOverrides,
  WeddingThemeConfig,
  WeddingThemePresetId,
} from '@/features/design/schemas/designSchemas';

/**
 * Curated Wedding Theme Presets & CSS Custom-Property Resolver (`P3-AC07`).
 *
 * All font stacks use offline/CSP-safe editorial system stacks so rendering is
 * 100% deterministic in CI and never leaks guest IPs to third-party font CDNs.
 */

export type HeadingFontPairId = NonNullable<ThemeTokenOverrides['headingFontPair']>;
export type CornerStyleId = NonNullable<ThemeTokenOverrides['cornerStyle']>;
export type SectionSpacingId = NonNullable<ThemeTokenOverrides['sectionSpacing']>;
export type OrnamentStyleId = NonNullable<ThemeTokenOverrides['ornamentStyle']>;

export const HEADING_FONT_STACKS: Readonly<Record<HeadingFontPairId, string>> = {
  editorial_serif: "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif",
  classic_serif: "Garamond, 'Baskerville Old Face', 'Times New Roman', Georgia, serif",
  romantic_serif: "Georgia, 'Cambria', 'Times New Roman', serif",
  modern_sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
};

const BODY_FONT_STACK = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

export interface ThemePresetDefinition {
  readonly id: WeddingThemePresetId;
  readonly name: string;
  readonly tagline: string;
  readonly isDarkSurface: boolean;
  readonly canvasBg: string;
  readonly surfaceBg: string;
  readonly surfaceMutedBg: string;
  readonly inkPrimary: string;
  readonly inkMuted: string;
  readonly accentHex: string;
  readonly accentContrastHex: string;
  readonly borderColor: string;
  readonly defaultHeadingFontPair: HeadingFontPairId;
  readonly defaultCornerStyle: CornerStyleId;
  readonly defaultSectionSpacing: SectionSpacingId;
  readonly defaultOrnamentStyle: OrnamentStyleId;
}

export const WEDDING_THEME_PRESETS: Readonly<Record<WeddingThemePresetId, ThemePresetDefinition>> =
  {
    editorial_ivory: {
      id: 'editorial_ivory',
      name: 'Editorial Ivory',
      tagline: 'Warm alabaster paper, espresso typography, and champagne gold hairlines.',
      isDarkSurface: false,
      canvasBg: '#FAF7F2',
      surfaceBg: '#FFFFFF',
      surfaceMutedBg: '#F3EDE3',
      inkPrimary: '#231F1E',
      inkMuted: '#655C56',
      accentHex: '#9A7B4F',
      accentContrastHex: '#FFFFFF',
      borderColor: '#E5DDD0',
      defaultHeadingFontPair: 'editorial_serif',
      defaultCornerStyle: 'sharp',
      defaultSectionSpacing: 'airy',
      defaultOrnamentStyle: 'minimal_line',
    },
    garden_sage: {
      id: 'garden_sage',
      name: 'Botanical Garden Sage',
      tagline: 'Soft eucalyptus mist, forest ink, and organic botanical flourishes.',
      isDarkSurface: false,
      canvasBg: '#F3F6F1',
      surfaceBg: '#FCFDFB',
      surfaceMutedBg: '#E6EDE3',
      inkPrimary: '#1E2D24',
      inkMuted: '#516357',
      accentHex: '#4F6F58',
      accentContrastHex: '#FFFFFF',
      borderColor: '#CFDCD1',
      defaultHeadingFontPair: 'romantic_serif',
      defaultCornerStyle: 'soft',
      defaultSectionSpacing: 'comfortable',
      defaultOrnamentStyle: 'botanical_flourish',
    },
    celestial_midnight: {
      id: 'celestial_midnight',
      name: 'Celestial Midnight',
      tagline: 'Black-tie midnight navy canvas with pearl ivory type and antique brass.',
      isDarkSurface: true,
      canvasBg: '#111827',
      surfaceBg: '#1B2436',
      surfaceMutedBg: '#243047',
      inkPrimary: '#F8F5EE',
      inkMuted: '#C5C9D3',
      accentHex: '#C8A45D',
      accentContrastHex: '#111827',
      borderColor: '#33415C',
      defaultHeadingFontPair: 'classic_serif',
      defaultCornerStyle: 'sharp',
      defaultSectionSpacing: 'airy',
      defaultOrnamentStyle: 'monogram_crest',
    },
    terracotta_atelier: {
      id: 'terracotta_atelier',
      name: 'Terracotta Atelier',
      tagline: 'Sunlit Mediterranean plaster, warm umber ink, and sculpted arch framing.',
      isDarkSurface: false,
      canvasBg: '#FBF4EC',
      surfaceBg: '#FFFDF9',
      surfaceMutedBg: '#F3E5D5',
      inkPrimary: '#2D1F18',
      inkMuted: '#6E564B',
      accentHex: '#B85D43',
      accentContrastHex: '#FFFFFF',
      borderColor: '#E6D2BE',
      defaultHeadingFontPair: 'editorial_serif',
      defaultCornerStyle: 'arch',
      defaultSectionSpacing: 'comfortable',
      defaultOrnamentStyle: 'minimal_line',
    },
  };

export const WEDDING_THEME_PRESET_LIST: readonly ThemePresetDefinition[] = [
  WEDDING_THEME_PRESETS.editorial_ivory,
  WEDDING_THEME_PRESETS.garden_sage,
  WEDDING_THEME_PRESETS.celestial_midnight,
  WEDDING_THEME_PRESETS.terracotta_atelier,
];

export interface ResolvedInvitationTheme {
  readonly preset: ThemePresetDefinition;
  readonly accentHex: string;
  readonly accentContrastHex: string;
  readonly canvasBg: string;
  readonly surfaceBg: string;
  readonly surfaceMutedBg: string;
  readonly inkPrimary: string;
  readonly inkMuted: string;
  readonly borderColor: string;
  readonly headingFontFamily: string;
  readonly bodyFontFamily: string;
  readonly cornerStyle: CornerStyleId;
  readonly sectionSpacing: SectionSpacingId;
  readonly ornamentStyle: OrnamentStyleId;
  readonly cssVariables: CSSProperties;
}

function getRelativeLuminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function resolveInvitationTheme(config: WeddingThemeConfig): ResolvedInvitationTheme {
  const preset = WEDDING_THEME_PRESETS[config.presetId];
  const overrides = config.tokenOverrides;

  const accentHex = overrides.primaryAccentHex ?? preset.accentHex;
  const accentContrastHex = overrides.primaryAccentHex
    ? getRelativeLuminance(overrides.primaryAccentHex) > 0.42
      ? '#1A1A1A'
      : '#FFFFFF'
    : preset.accentContrastHex;

  let canvasBg = preset.canvasBg;
  if (!preset.isDarkSurface && overrides.surfaceTint === 'warm') {
    canvasBg = '#FDF8F0';
  } else if (!preset.isDarkSurface && overrides.surfaceTint === 'cool') {
    canvasBg = '#F4F7F9';
  } else if (!preset.isDarkSurface && overrides.surfaceTint === 'high_contrast') {
    canvasBg = '#FFFFFF';
  }

  const headingPair = overrides.headingFontPair ?? preset.defaultHeadingFontPair;
  const cornerStyle = overrides.cornerStyle ?? preset.defaultCornerStyle;
  const sectionSpacing = overrides.sectionSpacing ?? preset.defaultSectionSpacing;
  const ornamentStyle = overrides.ornamentStyle ?? preset.defaultOrnamentStyle;

  const radiusCss =
    cornerStyle === 'sharp' ? '0.25rem' : cornerStyle === 'arch' ? '1.5rem' : '0.875rem';

  const cssVariables = {
    '--inv-canvas': canvasBg,
    '--inv-surface': preset.surfaceBg,
    '--inv-surface-muted': preset.surfaceMutedBg,
    '--inv-ink': preset.inkPrimary,
    '--inv-ink-muted': preset.inkMuted,
    '--inv-accent': accentHex,
    '--inv-accent-contrast': accentContrastHex,
    '--inv-border': preset.borderColor,
    '--inv-font-heading': HEADING_FONT_STACKS[headingPair],
    '--inv-font-body': BODY_FONT_STACK,
    '--inv-radius': radiusCss,
  } as CSSProperties;

  return {
    preset,
    accentHex,
    accentContrastHex,
    canvasBg,
    surfaceBg: preset.surfaceBg,
    surfaceMutedBg: preset.surfaceMutedBg,
    inkPrimary: preset.inkPrimary,
    inkMuted: preset.inkMuted,
    borderColor: preset.borderColor,
    headingFontFamily: HEADING_FONT_STACKS[headingPair],
    bodyFontFamily: BODY_FONT_STACK,
    cornerStyle,
    sectionSpacing,
    ornamentStyle,
    cssVariables,
  };
}
