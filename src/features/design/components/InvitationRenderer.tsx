import { type CSSProperties, type JSX, type ReactNode, useEffect, useRef, useState } from 'react';
import { BackdropAmbientEffect } from '@/features/design/components/BackdropAmbientEffect';
import { OurStoryGalleryView } from '@/features/design/components/sections/OurStoryGalleryView';
import { renderRegisteredSection } from '@/features/design/registry/sectionRegistry';
import {
  type CardBorderStyleId,
  type CustomFontAsset,
  type ElementMotionStyle,
  type InvitationDocument,
  parseInvitationDocument,
} from '@/features/design/schemas/designSchemas';
import {
  buildCustomFontFamilyName,
  isVideoAssetUrl,
  resolveDefaultElementMotions,
  resolveInvitationTheme,
  resolveSectionStyleOverrides,
} from '@/features/design/themes/themePresets';

export type InvitationViewportMode = 'desktop' | 'mobile';
export type InvitationBackdropMode = 'frame' | 'page';

export interface InvitationRendererProps {
  /**
   * Accepts a validated `InvitationDocument` or raw untrusted snapshot/draft input.
   * `<InvitationRenderer />` always validates through `parseInvitationDocument` before
   * rendering (`P3-AC06`, `P3-AC07`).
   */
  readonly document: InvitationDocument | unknown;
  readonly viewportMode?: InvitationViewportMode | undefined;
  readonly backdropMode?: InvitationBackdropMode | undefined;
  readonly onPrimaryRsvpAction?: (() => void) | undefined;
}

const loadedCustomFontKeys = new Set<string>();

function useCustomInvitationFonts(customFonts: readonly CustomFontAsset[]): void {
  const fontSignature = customFonts.map((f) => `${f.id}:${f.url}`).join('|');

  useEffect(() => {
    if (customFonts.length === 0) {
      return;
    }
    if (typeof window === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
      return;
    }

    let cancelled = false;

    for (const font of customFonts) {
      const familyName = buildCustomFontFamilyName(font.url);
      const cacheKey = `${familyName}::${font.url}`;
      if (loadedCustomFontKeys.has(cacheKey)) {
        continue;
      }

      try {
        const face = new FontFace(familyName, `url("${encodeURI(font.url)}")`, {
          display: 'swap',
        });
        void face
          .load()
          .then((loadedFace) => {
            if (cancelled) {
              return;
            }
            document.fonts.add(loadedFace);
            loadedCustomFontKeys.add(cacheKey);
          })
          .catch(() => {
            // Graceful fallback to configured editorial font stack.
          });
      } catch {
        // Graceful fallback in restricted environments.
      }
    }

    return () => {
      cancelled = true;
    };
  }, [customFonts, fontSignature]);
}

interface ScrollAnimatedSectionProps {
  readonly sectionType: string;
  readonly headingScale?: string | undefined;
  readonly bodyScale?: string | undefined;
  readonly textMotion: ElementMotionStyle;
  readonly cardMotion: ElementMotionStyle;
  readonly featureMotion: ElementMotionStyle;
  readonly cardBorderStyle: CardBorderStyleId;
  readonly style: CSSProperties;
  readonly children: ReactNode;
}

function ScrollAnimatedSection({
  sectionType,
  headingScale,
  bodyScale,
  textMotion,
  cardMotion,
  featureMotion,
  cardBorderStyle,
  style,
  children,
}: ScrollAnimatedSectionProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const hasAnyMotion =
    textMotion !== 'none' || cardMotion !== 'none' || featureMotion !== 'none';

  const [inView, setInView] = useState<boolean>(() => {
    if (!hasAnyMotion) {
      return true;
    }
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return true;
    }
    return false;
  });

  useEffect(() => {
    if (!hasAnyMotion) {
      return;
    }
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const el = ref.current;
    if (!el) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        // Continuously re-triggers smoothly as the guest scrolls into and out of focus
        setInView(entry.isIntersecting);
      },
      {
        threshold: 0.1,
        rootMargin: '-4% 0px -4% 0px',
      },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [hasAnyMotion]);

  const effectiveInView = !hasAnyMotion || inView;

  return (
    <div
      ref={ref}
      data-section-type={sectionType}
      data-section-heading-scale={headingScale}
      data-section-body-scale={bodyScale}
      data-text-motion={textMotion}
      data-card-motion={cardMotion}
      data-feature-motion={featureMotion}
      data-card-border-style={cardBorderStyle}
      data-in-view={String(effectiveInView)}
      style={style}
    >
      {children}
    </div>
  );
}

export function InvitationRenderer({
  document: rawDocument,
  viewportMode = 'desktop',
  backdropMode = 'frame',
  onPrimaryRsvpAction,
}: InvitationRendererProps): JSX.Element {
  const [activeView, setActiveView] = useState<'invitation' | 'story'>('invitation');

  const validation = parseInvitationDocument(rawDocument);
  const resolvedTheme = validation.ok ? resolveInvitationTheme(validation.data.theme) : null;

  useCustomInvitationFonts(resolvedTheme?.customFonts ?? []);

  if (!validation.ok || !resolvedTheme) {
    return (
      <div
        role="alert"
        data-testid="invitation-schema-invalid"
        className="border-destructive/40 bg-destructive/10 text-destructive rounded-xl border p-6 text-sm"
      >
        <p className="font-semibold">Invitation configuration could not be rendered</p>
        <p className="mt-1 text-xs opacity-90">
          One or more theme or section fields failed schema validation:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          {!validation.ok
            ? validation.issues.slice(0, 5).map((issue, idx) => (
                <li key={`${issue.path}-${idx}`}>
                  <code>{issue.path}</code>: {issue.message}
                </li>
              ))
            : null}
        </ul>
      </div>
    );
  }

  const doc = validation.data;
  const visibleSections = [...doc.sections]
    .filter((section) => section.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const storySection = doc.sections.find((s) => s.sectionType === 'our_story');

  const isMobileFrame = viewportMode === 'mobile';
  const hasBackgroundMedia = Boolean(resolvedTheme.backgroundImageUrl);
  const hasAmbientEffect = resolvedTheme.backgroundEffect !== 'none';
  const hasOuterBackdrop = hasBackgroundMedia || hasAmbientEffect;
  const isVideoBackdrop = isVideoAssetUrl(resolvedTheme.backgroundImageUrl);
  const isPageBackdrop = backdropMode === 'page';
  const isGlassCard = resolvedTheme.cardOpacity < 100;

  const defaultMotions = resolveDefaultElementMotions(resolvedTheme.animationStyle);

  const handleOpenFullStory = () => {
    setActiveView('story');
    if (isPageBackdrop && typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBackToInvitation = () => {
    setActiveView('invitation');
    if (isPageBackdrop && typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const backdropPositionClass = isPageBackdrop ? 'fixed inset-0' : 'absolute inset-0';

  const backdropLayers = (
    <>
      {resolvedTheme.backgroundImageUrl ? (
        <>
          {isVideoBackdrop ? (
            <video
              aria-hidden="true"
              data-testid="invitation-background-video"
              src={resolvedTheme.backgroundImageUrl}
              autoPlay
              loop
              muted
              playsInline
              className={`pointer-events-none ${backdropPositionClass} z-0 h-full w-full object-cover`}
            />
          ) : (
            <div
              aria-hidden="true"
              data-testid="invitation-background-image"
              className={`pointer-events-none ${backdropPositionClass} z-0 bg-cover bg-center bg-no-repeat`}
              style={{
                backgroundImage: `url("${encodeURI(resolvedTheme.backgroundImageUrl)}")`,
              }}
            />
          )}
          <div
            aria-hidden="true"
            data-testid="invitation-background-overlay"
            data-overlay-opacity={resolvedTheme.backgroundOverlayOpacity}
            className={`pointer-events-none ${backdropPositionClass} z-[1] transition-opacity duration-150`}
            style={{
              backgroundColor: resolvedTheme.canvasBg,
              opacity: resolvedTheme.backgroundOverlayOpacity / 100,
            }}
          />
        </>
      ) : null}
      <BackdropAmbientEffect
        effect={resolvedTheme.backgroundEffect}
        isPageBackdrop={isPageBackdrop}
        accentHex={resolvedTheme.accentHex}
      />
    </>
  );

  const articleStyle: CSSProperties = {
    ...resolvedTheme.cssVariables,
    backgroundColor: 'var(--inv-canvas)',
    color: 'var(--inv-ink)',
    borderColor: 'var(--inv-border)',
    fontFamily: 'var(--inv-font-body)',
    ...(isGlassCard
      ? {
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }
      : {}),
  };

  const articleNode = (
    <article
      data-testid="invitation-renderer"
      data-theme-preset={doc.theme.presetId}
      data-dark-surface={String(resolvedTheme.isDarkSurface)}
      data-has-background-image={String(hasBackgroundMedia)}
      data-background-effect={resolvedTheme.backgroundEffect}
      data-section-spacing={resolvedTheme.sectionSpacing}
      data-animation-style={resolvedTheme.animationStyle}
      data-card-border-style={resolvedTheme.cardBorderStyle}
      data-card-opacity={resolvedTheme.cardOpacity}
      aria-label={`${doc.wedding.title} invitation`}
      className={`relative z-10 overflow-hidden rounded-xl border ${
        hasOuterBackdrop ? 'shadow-lg' : 'shadow-sm'
      }`}
      style={articleStyle}
    >
      {activeView === 'story' && storySection && storySection.sectionType === 'our_story' ? (
        <div
          style={resolveSectionStyleOverrides(storySection.content.style, resolvedTheme)}
          data-card-border-style={
            storySection.content.style?.cardBorderStyle ?? resolvedTheme.cardBorderStyle
          }
          data-section-heading-scale={
            storySection.content.style?.headingSize &&
            storySection.content.style.headingSize !== 'md'
              ? storySection.content.style.headingSize
              : undefined
          }
          data-section-body-scale={
            storySection.content.style?.bodySize && storySection.content.style.bodySize !== 'md'
              ? storySection.content.style.bodySize
              : undefined
          }
        >
          <OurStoryGalleryView
            content={storySection.content}
            wedding={doc.wedding}
            ornamentStyle={resolvedTheme.ornamentStyle}
            onBack={handleBackToInvitation}
          />
        </div>
      ) : (
        <>
          {visibleSections.map((section, idx) => {
            const sectionStyle = section.content.style;
            const sectionCss = {
              ...resolveSectionStyleOverrides(sectionStyle, resolvedTheme),
              '--inv-stagger-idx': idx,
            } as CSSProperties;
            const headingScale =
              sectionStyle?.headingSize && sectionStyle.headingSize !== 'md'
                ? sectionStyle.headingSize
                : undefined;
            const bodyScale =
              sectionStyle?.bodySize && sectionStyle.bodySize !== 'md'
                ? sectionStyle.bodySize
                : undefined;

            const textMotion = sectionStyle?.textMotion ?? defaultMotions.textMotion;
            const cardMotion = sectionStyle?.cardMotion ?? defaultMotions.cardMotion;
            const featureMotion = sectionStyle?.featureMotion ?? defaultMotions.featureMotion;
            const cardBorderStyle =
              sectionStyle?.cardBorderStyle ?? resolvedTheme.cardBorderStyle;

            return (
              <ScrollAnimatedSection
                key={section.id}
                sectionType={section.sectionType}
                headingScale={headingScale}
                bodyScale={bodyScale}
                textMotion={textMotion}
                cardMotion={cardMotion}
                featureMotion={featureMotion}
                cardBorderStyle={cardBorderStyle}
                style={sectionCss}
              >
                {renderRegisteredSection({
                  section,
                  wedding: doc.wedding,
                  ornamentStyle: resolvedTheme.ornamentStyle,
                  onPrimaryAction: onPrimaryRsvpAction,
                  onOpenFullStory: handleOpenFullStory,
                })}
              </ScrollAnimatedSection>
            );
          })}

          <footer
            className="border-t px-6 py-6 text-center text-xs"
            style={{
              borderColor: 'var(--inv-border)',
              color: 'var(--inv-ink-muted)',
            }}
          >
            {doc.wedding.partnerOneName} &amp; {doc.wedding.partnerTwoName}
          </footer>
        </>
      )}
    </article>
  );

  if (isPageBackdrop) {
    return (
      <>
        {backdropLayers}
        <div
          data-testid="invitation-viewport-frame"
          data-viewport-mode={viewportMode}
          className={
            isMobileFrame
              ? 'relative z-10 mx-auto w-full max-w-[390px] transition-all'
              : 'relative z-10 w-full'
          }
        >
          {articleNode}
        </div>
      </>
    );
  }

  return (
    <div
      data-testid="invitation-viewport-frame"
      data-viewport-mode={viewportMode}
      className={
        hasOuterBackdrop
          ? `relative isolate overflow-hidden rounded-xl p-4 transition-all sm:p-8 ${
              isMobileFrame ? 'mx-auto w-full max-w-[440px]' : 'w-full'
            }`
          : isMobileFrame
            ? 'mx-auto w-full max-w-[390px] transition-all'
            : 'w-full'
      }
    >
      {backdropLayers}
      <div className={isMobileFrame ? 'mx-auto w-full max-w-[390px]' : 'w-full'}>
        {articleNode}
      </div>
    </div>
  );
}
