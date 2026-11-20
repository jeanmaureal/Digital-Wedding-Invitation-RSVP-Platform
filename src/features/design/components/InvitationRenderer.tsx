import { type JSX, useEffect } from 'react';
import { renderRegisteredSection } from '@/features/design/registry/sectionRegistry';
import {
  type CustomFontAsset,
  type InvitationDocument,
  parseInvitationDocument,
} from '@/features/design/schemas/designSchemas';
import {
  buildCustomFontFamilyName,
  resolveInvitationTheme,
  resolveSectionStyleOverrides,
} from '@/features/design/themes/themePresets';

export type InvitationViewportMode = 'desktop' | 'mobile';

export interface InvitationRendererProps {
  /**
   * Accepts a validated `InvitationDocument` or raw untrusted snapshot/draft input.
   * `<InvitationRenderer />` always validates through `parseInvitationDocument` before
   * rendering (`P3-AC06`, `P3-AC07`).
   */
  readonly document: InvitationDocument | unknown;
  readonly viewportMode?: InvitationViewportMode | undefined;
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

export function InvitationRenderer({
  document: rawDocument,
  viewportMode = 'desktop',
  onPrimaryRsvpAction,
}: InvitationRendererProps): JSX.Element {
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

  const isMobileFrame = viewportMode === 'mobile';
  const hasBackgroundImage = Boolean(resolvedTheme.backgroundImageUrl);

  return (
    <div
      data-testid="invitation-viewport-frame"
      data-viewport-mode={viewportMode}
      className={isMobileFrame ? 'mx-auto w-full max-w-[390px] transition-all' : 'w-full'}
    >
      <article
        data-testid="invitation-renderer"
        data-theme-preset={doc.theme.presetId}
        data-dark-surface={String(resolvedTheme.isDarkSurface)}
        data-has-background-image={String(hasBackgroundImage)}
        data-section-spacing={resolvedTheme.sectionSpacing}
        aria-label={`${doc.wedding.title} invitation`}
        className="relative isolate overflow-hidden rounded-xl border shadow-sm"
        style={{
          ...resolvedTheme.cssVariables,
          backgroundColor: 'var(--inv-canvas)',
          color: 'var(--inv-ink)',
          borderColor: 'var(--inv-border)',
          fontFamily: 'var(--inv-font-body)',
        }}
      >
        {resolvedTheme.backgroundImageUrl ? (
          <>
            <div
              aria-hidden="true"
              data-testid="invitation-background-image"
              className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
              style={{
                backgroundImage: `url("${encodeURI(resolvedTheme.backgroundImageUrl)}")`,
              }}
            />
            <div
              aria-hidden="true"
              data-testid="invitation-background-overlay"
              data-overlay-opacity={resolvedTheme.backgroundOverlayOpacity}
              className="pointer-events-none absolute inset-0 z-[1] transition-opacity duration-150"
              style={{
                backgroundColor: 'var(--inv-canvas)',
                opacity: resolvedTheme.backgroundOverlayOpacity / 100,
              }}
            />
          </>
        ) : null}

        <div className="relative z-10">
          {visibleSections.map((section) => {
            const sectionStyle = section.content.style;
            const sectionCss = resolveSectionStyleOverrides(sectionStyle, resolvedTheme);
            const headingScale =
              sectionStyle?.headingSize && sectionStyle.headingSize !== 'md'
                ? sectionStyle.headingSize
                : undefined;
            const bodyScale =
              sectionStyle?.bodySize && sectionStyle.bodySize !== 'md'
                ? sectionStyle.bodySize
                : undefined;

            return (
              <div
                key={section.id}
                data-section-type={section.sectionType}
                data-section-heading-scale={headingScale}
                data-section-body-scale={bodyScale}
                style={sectionCss}
              >
                {renderRegisteredSection({
                  section,
                  wedding: doc.wedding,
                  ornamentStyle: resolvedTheme.ornamentStyle,
                  onPrimaryAction: onPrimaryRsvpAction,
                })}
              </div>
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
        </div>
      </article>
    </div>
  );
}
