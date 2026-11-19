import type { JSX } from 'react';
import type { OrnamentStyleId } from '@/features/design/themes/themePresets';

export interface OrnamentDividerProps {
  readonly styleId: OrnamentStyleId;
  readonly monogramText?: string | undefined;
}

export function OrnamentDivider({
  styleId,
  monogramText,
}: OrnamentDividerProps): JSX.Element | null {
  if (styleId === 'none') {
    return null;
  }

  if (styleId === 'monogram_crest') {
    return (
      <div
        aria-hidden="true"
        className="my-4 flex items-center justify-center gap-3"
        style={{ color: 'var(--inv-accent)' }}
      >
        <span className="h-px w-10 opacity-60" style={{ backgroundColor: 'var(--inv-accent)' }} />
        <span
          className="inline-flex size-8 items-center justify-center rounded-full border text-xs font-semibold tracking-widest uppercase"
          style={{ borderColor: 'var(--inv-accent)' }}
        >
          {monogramText ?? '✦'}
        </span>
        <span className="h-px w-10 opacity-60" style={{ backgroundColor: 'var(--inv-accent)' }} />
      </div>
    );
  }

  if (styleId === 'botanical_flourish') {
    return (
      <div
        aria-hidden="true"
        className="my-3 flex items-center justify-center gap-2 text-xs tracking-[0.25em]"
        style={{ color: 'var(--inv-accent)' }}
      >
        <span>―</span>
        <span>❧</span>
        <span>―</span>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="my-3 flex justify-center">
      <span className="h-px w-14 opacity-70" style={{ backgroundColor: 'var(--inv-accent)' }} />
    </div>
  );
}
