import type { CSSProperties } from 'react';
import type {
  BackgroundEffectId,
  CardBorderStyleId,
  CustomFontAsset,
  ElementMotionStyle,
  InvitationAnimationStyle,
  SectionStyleOverrides,
  ThemeTokenOverrides,
  WeddingThemeConfig,
  WeddingThemePresetId,
} from '@/features/design/schemas/designSchemas';

/**
 * Curated Wedding Theme Presets & CSS Custom-Property Resolver (`P3-AC07`).
 *
 * All built-in font stacks use offline/CSP-safe editorial system stacks so rendering is
 * 100% deterministic in CI and never leaks guest IPs to third-party font CDNs.
 * Organizer-uploaded custom fonts (.ttf/.otf/.woff/.woff2) are hosted on Supabase Storage
 * and registered via the browser `FontFace` API.
 */

export type HeadingFontPairId = NonNullable<ThemeTokenOverrides['headingFontPair']>;
export type BodyFontPairId = NonNullable<ThemeTokenOverrides['bodyFontPair']>;
export type CustomFontTargetId = NonNullable<ThemeTokenOverrides['customFontTarget']>;
export type CornerStyleId = NonNullable<ThemeTokenOverrides['cornerStyle']>;
export type SectionSpacingId = NonNullable<ThemeTokenOverrides['sectionSpacing']>;
export type OrnamentStyleId = NonNullable<ThemeTokenOverrides['ornamentStyle']>;

export const DEFAULT_BACKGROUND_OVERLAY_OPACITY = 75;
export const DEFAULT_CARD_OPACITY = 100;
export const DEFAULT_ANIMATION_STYLE: InvitationAnimationStyle = 'editorial_rise';
export const DEFAULT_BACKGROUND_EFFECT: BackgroundEffectId = 'none';
export const DEFAULT_CARD_BORDER_STYLE: CardBorderStyleId = 'classic';
export const LEGACY_CUSTOM_FONT_ID = 'legacy-custom-font' as const;

export function resolveDefaultElementMotions(animationStyle: InvitationAnimationStyle): {
  readonly textMotion: ElementMotionStyle;
  readonly cardMotion: ElementMotionStyle;
  readonly featureMotion: ElementMotionStyle;
} {
  switch (animationStyle) {
    case 'none':
      return { textMotion: 'none', cardMotion: 'none', featureMotion: 'none' };
    case 'gentle_fade':
      return { textMotion: 'fade', cardMotion: 'fade', featureMotion: 'fade' };
    case 'romantic_float':
      return { textMotion: 'rise', cardMotion: 'zoom_soft', featureMotion: 'float' };
    case 'editorial_rise':
    default:
      return { textMotion: 'rise', cardMotion: 'rise', featureMotion: 'zoom_soft' };
  }
}

const MOTION_VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov']);

export function isVideoAssetUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }
  const cleanPath = (url.split(/[?#]/)[0] ?? '').trim().toLowerCase();
  const lastDot = cleanPath.lastIndexOf('.');
  if (lastDot < 0 || lastDot === cleanPath.length - 1) {
    return false;
  }
  return MOTION_VIDEO_EXTENSIONS.has(cleanPath.slice(lastDot + 1));
}

export const HEADING_FONT_STACKS: Readonly<Record<HeadingFontPairId, string>> = {
  editorial_serif: "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif",
  classic_serif: "Garamond, 'Baskerville Old Face', 'Times New Roman', Georgia, serif",
  romantic_serif: "Georgia, 'Cambria', 'Times New Roman', serif",
  modern_sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  handwritten_script: "'Snell Roundhand', 'Brush Script MT', 'Segoe Script', cursive",
  minimal_mono: "ui-monospace, 'SFMono-Regular', 'Cascadia Mono', 'Courier New', monospace",
};

export const BODY_FONT_STACKS: Readonly<Record<BodyFontPairId, string>> = {
  modern_sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  humanist_sans: "'Optima', 'Candara', 'Calibri', 'Segoe UI', sans-serif",
  editorial_serif: "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif",
  classic_serif: "Garamond, 'Baskerville Old Face', 'Times New Roman', Georgia, serif",
  minimal_mono: "ui-monospace, 'SFMono-Regular', 'Cascadia Mono', 'Courier New', monospace",
};

export const ALL_BUILTIN_FONT_OPTIONS: ReadonlyArray<{
  readonly value: string;
  readonly label: string;
  readonly stack: string;
}> = [
  {
    value: 'builtin:editorial_serif',
    label: 'Editorial Serif',
    stack: HEADING_FONT_STACKS.editorial_serif,
  },
  {
    value: 'builtin:classic_serif',
    label: 'Classic Serif',
    stack: HEADING_FONT_STACKS.classic_serif,
  },
  {
    value: 'builtin:romantic_serif',
    label: 'Romantic Serif',
    stack: HEADING_FONT_STACKS.romantic_serif,
  },
  {
    value: 'builtin:modern_sans',
    label: 'Modern Sans',
    stack: HEADING_FONT_STACKS.modern_sans,
  },
  {
    value: 'builtin:humanist_sans',
    label: 'Humanist Sans',
    stack: BODY_FONT_STACKS.humanist_sans,
  },
  {
    value: 'builtin:handwritten_script',
    label: 'Handwritten Script',
    stack: HEADING_FONT_STACKS.handwritten_script,
  },
  {
    value: 'builtin:minimal_mono',
    label: 'Minimal Monospace',
    stack: HEADING_FONT_STACKS.minimal_mono,
  },
];

const BUILTIN_STACK_BY_KEY: Readonly<Record<string, string>> = Object.fromEntries(
  ALL_BUILTIN_FONT_OPTIONS.flatMap((opt) => [
    [opt.value, opt.stack],
    [opt.value.replace(/^builtin:/, ''), opt.stack],
  ]),
);

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
  readonly defaultBodyFontPair: BodyFontPairId;
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
      defaultBodyFontPair: 'modern_sans',
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
      defaultBodyFontPair: 'modern_sans',
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
      defaultBodyFontPair: 'modern_sans',
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
      defaultBodyFontPair: 'modern_sans',
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
  readonly isDarkSurface: boolean;
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
  readonly customFonts: readonly CustomFontAsset[];
  readonly customFontFamilyName: string | null;
  readonly customFontUrl: string | null;
  readonly customFontTarget: CustomFontTargetId;
  readonly backgroundImageUrl: string | null;
  readonly backgroundOverlayOpacity: number;
  readonly backgroundEffect: BackgroundEffectId;
  readonly cardOpacity: number;
  readonly cardBorderStyle: CardBorderStyleId;
  readonly animationStyle: InvitationAnimationStyle;
  readonly cornerStyle: CornerStyleId;
  readonly sectionSpacing: SectionSpacingId;
  readonly ornamentStyle: OrnamentStyleId;
  readonly cssVariables: CSSProperties;
}

export function getRelativeLuminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Produces a deterministic, CSS-safe `FontFace` family identifier from a font URL
 * without ever interpolating untrusted strings into CSS.
 */
export function buildCustomFontFamilyName(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i += 1) {
    hash = ((hash << 5) + hash + url.charCodeAt(i)) >>> 0;
  }
  return `InvCustomFont_${hash.toString(36)}`;
}

/**
 * Returns the full library of imported custom fonts, seamlessly including any
 * legacy single `customFontUrl` entry so previously uploaded fonts are preserved.
 */
export function getNormalizedCustomFonts(
  overrides: ThemeTokenOverrides,
): readonly CustomFontAsset[] {
  const list: CustomFontAsset[] = [...(overrides.customFonts ?? [])];
  if (overrides.customFontUrl && !list.some((f) => f.url === overrides.customFontUrl)) {
    list.unshift({
      id: LEGACY_CUSTOM_FONT_ID,
      name: overrides.customFontName ?? 'Custom Font',
      url: overrides.customFontUrl,
    });
  }
  return list;
}

export function resolveFontSelectionToCssStack(
  selection: string | undefined,
  fallbackStack: string,
  customFonts: readonly CustomFontAsset[],
): string | null {
  if (!selection) {
    return null;
  }
  if (selection.startsWith('custom:')) {
    const fontId = selection.slice('custom:'.length);
    const font = customFonts.find((f) => f.id === fontId);
    if (!font) {
      return null;
    }
    return `'${buildCustomFontFamilyName(font.url)}', ${fallbackStack}`;
  }
  return BUILTIN_STACK_BY_KEY[selection] ?? null;
}

function mixColorOpacity(hex: string, opacityPercent: number): string {
  if (opacityPercent >= 100) {
    return hex;
  }
  return `color-mix(in srgb, ${hex} ${opacityPercent}%, transparent)`;
}

export function resolveSectionStyleOverrides(
  style: SectionStyleOverrides | undefined,
  resolvedTheme: ResolvedInvitationTheme,
): CSSProperties {
  if (!style) {
    return {};
  }

  const vars: Record<string, string> = {};
  const effectiveOpacity = style.cardOpacity ?? resolvedTheme.cardOpacity;

  const baseBg = style.backgroundBgHex ?? resolvedTheme.canvasBg;
  const baseSurface = style.surfaceBgHex ?? resolvedTheme.surfaceBg;
  const baseSurfaceMuted = style.backgroundBgHex ?? resolvedTheme.surfaceMutedBg;

  if (style.backgroundBgHex || typeof style.cardOpacity === 'number') {
    const mixedBg = mixColorOpacity(baseBg, effectiveOpacity);
    vars['--inv-canvas'] = mixedBg;
    vars.backgroundColor = mixedBg;
    vars['--inv-surface-muted'] = mixColorOpacity(baseSurfaceMuted, effectiveOpacity);
  }
  if (style.surfaceBgHex || typeof style.cardOpacity === 'number') {
    vars['--inv-surface'] = mixColorOpacity(baseSurface, effectiveOpacity);
  }
  if (typeof style.cardOpacity === 'number' && style.cardOpacity < 100) {
    vars.backdropFilter = 'blur(8px)';
    vars.WebkitBackdropFilter = 'blur(8px)';
  }
  if (style.inkPrimaryHex) {
    vars['--inv-ink'] = style.inkPrimaryHex;
    vars.color = style.inkPrimaryHex;
  }
  if (style.inkMutedHex) {
    vars['--inv-ink-muted'] = style.inkMutedHex;
  }
  if (style.accentHex) {
    vars['--inv-accent'] = style.accentHex;
    vars['--inv-accent-contrast'] =
      getRelativeLuminance(style.accentHex) > 0.42 ? '#1A1A1A' : '#FFFFFF';
  }

  const headingStack = resolveFontSelectionToCssStack(
    style.headingFont,
    resolvedTheme.headingFontFamily,
    resolvedTheme.customFonts,
  );
  if (headingStack) {
    vars['--inv-font-heading'] = headingStack;
  }

  const bodyStack = resolveFontSelectionToCssStack(
    style.bodyFont,
    resolvedTheme.bodyFontFamily,
    resolvedTheme.customFonts,
  );
  if (bodyStack) {
    vars['--inv-font-body'] = bodyStack;
    vars.fontFamily = bodyStack;
  }

  return vars as CSSProperties;
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
  if (overrides.canvasBgHex) {
    canvasBg = overrides.canvasBgHex;
  }

  const isDarkSurface = overrides.canvasBgHex
    ? getRelativeLuminance(overrides.canvasBgHex) < 0.2
    : preset.isDarkSurface;

  const surfaceBg = overrides.surfaceBgHex ?? preset.surfaceBg;
  const surfaceMutedBg = overrides.surfaceMutedBgHex ?? preset.surfaceMutedBg;
  const inkPrimary = overrides.inkPrimaryHex ?? preset.inkPrimary;
  const inkMuted = overrides.inkMutedHex ?? preset.inkMuted;
  const borderColor = overrides.borderColorHex ?? preset.borderColor;

  const customFonts = getNormalizedCustomFonts(overrides);

  const headingPair = overrides.headingFontPair ?? preset.defaultHeadingFontPair;
  const bodyPair = overrides.bodyFontPair ?? preset.defaultBodyFontPair;

  const baseHeadingStack = HEADING_FONT_STACKS[headingPair];
  const baseBodyStack = BODY_FONT_STACKS[bodyPair];

  // Resolve global heading font: explicit headingCustomFontId > legacy customFontUrl+target > built-in stack
  const customFontTarget: CustomFontTargetId = overrides.customFontTarget ?? 'heading';
  let resolvedHeadingCustomFont: CustomFontAsset | undefined;
  let resolvedBodyCustomFont: CustomFontAsset | undefined;

  if (overrides.headingCustomFontId) {
    resolvedHeadingCustomFont = customFonts.find((f) => f.id === overrides.headingCustomFontId);
  } else if (
    overrides.customFontUrl &&
    (customFontTarget === 'heading' || customFontTarget === 'both')
  ) {
    resolvedHeadingCustomFont = customFonts.find((f) => f.url === overrides.customFontUrl);
  }

  if (overrides.bodyCustomFontId) {
    resolvedBodyCustomFont = customFonts.find((f) => f.id === overrides.bodyCustomFontId);
  } else if (
    overrides.customFontUrl &&
    (customFontTarget === 'body' || customFontTarget === 'both')
  ) {
    resolvedBodyCustomFont = customFonts.find((f) => f.url === overrides.customFontUrl);
  }

  const headingFontFamily = resolvedHeadingCustomFont
    ? `'${buildCustomFontFamilyName(resolvedHeadingCustomFont.url)}', ${baseHeadingStack}`
    : baseHeadingStack;

  const bodyFontFamily = resolvedBodyCustomFont
    ? `'${buildCustomFontFamilyName(resolvedBodyCustomFont.url)}', ${baseBodyStack}`
    : baseBodyStack;

  const primaryCustomFont = resolvedHeadingCustomFont ?? resolvedBodyCustomFont ?? null;
  const customFontUrl = primaryCustomFont?.url ?? overrides.customFontUrl ?? null;
  const customFontFamilyName = customFontUrl ? buildCustomFontFamilyName(customFontUrl) : null;

  const backgroundImageUrl = overrides.backgroundImageUrl ?? null;
  const backgroundOverlayOpacity =
    overrides.backgroundOverlayOpacity ?? DEFAULT_BACKGROUND_OVERLAY_OPACITY;
  const backgroundEffect: BackgroundEffectId =
    overrides.backgroundEffect ?? DEFAULT_BACKGROUND_EFFECT;
  const cardOpacity = overrides.cardOpacity ?? DEFAULT_CARD_OPACITY;
  const cardBorderStyle: CardBorderStyleId =
    overrides.cardBorderStyle ?? DEFAULT_CARD_BORDER_STYLE;
  const animationStyle: InvitationAnimationStyle =
    overrides.animationStyle ?? DEFAULT_ANIMATION_STYLE;

  const cornerStyle = overrides.cornerStyle ?? preset.defaultCornerStyle;
  const sectionSpacing = overrides.sectionSpacing ?? preset.defaultSectionSpacing;
  const ornamentStyle = overrides.ornamentStyle ?? preset.defaultOrnamentStyle;

  const radiusCss =
    cornerStyle === 'sharp' ? '0.25rem' : cornerStyle === 'arch' ? '1.5rem' : '0.875rem';

  const cssVariables = {
    '--inv-canvas': mixColorOpacity(canvasBg, cardOpacity),
    '--inv-surface': mixColorOpacity(surfaceBg, cardOpacity),
    '--inv-surface-muted': mixColorOpacity(surfaceMutedBg, cardOpacity),
    '--inv-ink': inkPrimary,
    '--inv-ink-muted': inkMuted,
    '--inv-accent': accentHex,
    '--inv-accent-contrast': accentContrastHex,
    '--inv-border': borderColor,
    '--inv-font-heading': headingFontFamily,
    '--inv-font-body': bodyFontFamily,
    '--inv-radius': radiusCss,
  } as CSSProperties;

  return {
    preset,
    isDarkSurface,
    accentHex,
    accentContrastHex,
    canvasBg,
    surfaceBg,
    surfaceMutedBg,
    inkPrimary,
    inkMuted,
    borderColor,
    headingFontFamily,
    bodyFontFamily,
    customFonts,
    customFontFamilyName,
    customFontUrl,
    customFontTarget,
    backgroundImageUrl,
    backgroundOverlayOpacity,
    backgroundEffect,
    cardOpacity,
    cardBorderStyle,
    animationStyle,
    cornerStyle,
    sectionSpacing,
    ornamentStyle,
    cssVariables,
  };
}
