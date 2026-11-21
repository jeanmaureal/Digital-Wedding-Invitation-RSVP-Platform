import type { CSSProperties, JSX } from 'react';
import type { BackgroundEffectId } from '@/features/design/schemas/designSchemas';

export interface BackdropAmbientEffectProps {
  readonly effect: BackgroundEffectId;
  readonly isPageBackdrop: boolean;
  readonly accentHex: string;
}

interface AmbientParticle {
  readonly leftPercent: number;
  readonly topPercent: number;
  readonly sizePx: number;
  readonly durationSec: number;
  readonly delaySec: number;
  readonly swayPx: number;
  readonly color: string;
}

const LEAF_PARTICLES: readonly AmbientParticle[] = [
  { leftPercent: 4, topPercent: -10, sizePx: 22, durationSec: 12, delaySec: 0, swayPx: 36, color: '#7D9B76' },
  { leftPercent: 12, topPercent: -12, sizePx: 18, durationSec: 15, delaySec: -4, swayPx: -28, color: '#A3B18A' },
  { leftPercent: 21, topPercent: -8, sizePx: 24, durationSec: 13.5, delaySec: -8, swayPx: 42, color: '#C8A45D' },
  { leftPercent: 31, topPercent: -14, sizePx: 19, durationSec: 16, delaySec: -2, swayPx: -34, color: '#588157' },
  { leftPercent: 42, topPercent: -10, sizePx: 20, durationSec: 14, delaySec: -10, swayPx: 30, color: '#B08968' },
  { leftPercent: 53, topPercent: -11, sizePx: 23, durationSec: 12.5, delaySec: -6, swayPx: -38, color: '#7D9B76' },
  { leftPercent: 64, topPercent: -9, sizePx: 17, durationSec: 15.5, delaySec: -1, swayPx: 26, color: '#A3B18A' },
  { leftPercent: 74, topPercent: -13, sizePx: 25, durationSec: 13, delaySec: -9, swayPx: -40, color: '#C8A45D' },
  { leftPercent: 83, topPercent: -10, sizePx: 21, durationSec: 14.5, delaySec: -5, swayPx: 32, color: '#588157' },
  { leftPercent: 92, topPercent: -12, sizePx: 19, durationSec: 16.5, delaySec: -11, swayPx: -30, color: '#B08968' },
  { leftPercent: 17, topPercent: -10, sizePx: 16, durationSec: 17, delaySec: -7, swayPx: 24, color: '#8FA987' },
  { leftPercent: 69, topPercent: -11, sizePx: 18, durationSec: 15, delaySec: -3, swayPx: -26, color: '#9A7B4F' },
];

const PETAL_PARTICLES: readonly AmbientParticle[] = [
  { leftPercent: 6, topPercent: -10, sizePx: 18, durationSec: 11, delaySec: 0, swayPx: 44, color: '#F2C6C2' },
  { leftPercent: 15, topPercent: -12, sizePx: 15, durationSec: 14, delaySec: -3, swayPx: -36, color: '#FADDE1' },
  { leftPercent: 24, topPercent: -9, sizePx: 20, durationSec: 12.5, delaySec: -7, swayPx: 48, color: '#E8A598' },
  { leftPercent: 34, topPercent: -13, sizePx: 16, durationSec: 15, delaySec: -1, swayPx: -32, color: '#F7D6E0' },
  { leftPercent: 45, topPercent: -10, sizePx: 19, durationSec: 13, delaySec: -9, swayPx: 38, color: '#F2C6C2' },
  { leftPercent: 56, topPercent: -11, sizePx: 14, durationSec: 14.5, delaySec: -5, swayPx: -42, color: '#FFE5EC' },
  { leftPercent: 66, topPercent: -8, sizePx: 21, durationSec: 12, delaySec: -2, swayPx: 34, color: '#E8A598' },
  { leftPercent: 76, topPercent: -12, sizePx: 17, durationSec: 16, delaySec: -8, swayPx: -38, color: '#FADDE1' },
  { leftPercent: 86, topPercent: -10, sizePx: 18, durationSec: 13.5, delaySec: -4, swayPx: 40, color: '#F7D6E0' },
  { leftPercent: 94, topPercent: -11, sizePx: 15, durationSec: 15.5, delaySec: -10, swayPx: -30, color: '#F2C6C2' },
  { leftPercent: 29, topPercent: -10, sizePx: 14, durationSec: 16.5, delaySec: -6, swayPx: 28, color: '#FFE5EC' },
  { leftPercent: 79, topPercent: -9, sizePx: 16, durationSec: 14, delaySec: -11, swayPx: -34, color: '#E8A598' },
];

const SPARKLE_PARTICLES: readonly AmbientParticle[] = [
  { leftPercent: 6, topPercent: 12, sizePx: 14, durationSec: 3.4, delaySec: 0, swayPx: 0, color: '#E6C27A' },
  { leftPercent: 14, topPercent: 42, sizePx: 18, durationSec: 4.2, delaySec: -1.1, swayPx: 0, color: '#F5E1A4' },
  { leftPercent: 9, topPercent: 76, sizePx: 12, durationSec: 3.8, delaySec: -2.3, swayPx: 0, color: '#D4AF37' },
  { leftPercent: 22, topPercent: 24, sizePx: 16, durationSec: 4.6, delaySec: -0.7, swayPx: 0, color: '#F5E1A4' },
  { leftPercent: 26, topPercent: 64, sizePx: 13, durationSec: 3.2, delaySec: -1.9, swayPx: 0, color: '#E6C27A' },
  { leftPercent: 38, topPercent: 16, sizePx: 15, durationSec: 4.0, delaySec: -2.8, swayPx: 0, color: '#D4AF37' },
  { leftPercent: 48, topPercent: 85, sizePx: 17, durationSec: 3.6, delaySec: -0.5, swayPx: 0, color: '#F5E1A4' },
  { leftPercent: 62, topPercent: 14, sizePx: 14, durationSec: 4.4, delaySec: -1.6, swayPx: 0, color: '#E6C27A' },
  { leftPercent: 74, topPercent: 30, sizePx: 19, durationSec: 3.5, delaySec: -2.1, swayPx: 0, color: '#F5E1A4' },
  { leftPercent: 79, topPercent: 68, sizePx: 13, durationSec: 4.1, delaySec: -0.9, swayPx: 0, color: '#D4AF37' },
  { leftPercent: 88, topPercent: 18, sizePx: 16, durationSec: 3.9, delaySec: -2.5, swayPx: 0, color: '#E6C27A' },
  { leftPercent: 92, topPercent: 52, sizePx: 18, durationSec: 4.5, delaySec: -1.4, swayPx: 0, color: '#F5E1A4' },
  { leftPercent: 85, topPercent: 84, sizePx: 14, durationSec: 3.3, delaySec: -0.3, swayPx: 0, color: '#D4AF37' },
  { leftPercent: 18, topPercent: 88, sizePx: 15, durationSec: 4.3, delaySec: -2.0, swayPx: 0, color: '#E6C27A' },
  { leftPercent: 5, topPercent: 56, sizePx: 13, durationSec: 3.7, delaySec: -1.3, swayPx: 0, color: '#F5E1A4' },
  { leftPercent: 95, topPercent: 34, sizePx: 12, durationSec: 3.1, delaySec: -0.8, swayPx: 0, color: '#D4AF37' },
];

export function BackdropAmbientEffect({
  effect,
  isPageBackdrop,
  accentHex,
}: BackdropAmbientEffectProps): JSX.Element | null {
  if (effect === 'none') {
    return null;
  }

  const positionClass = isPageBackdrop ? 'fixed inset-0' : 'absolute inset-0';

  if (effect === 'sparkles') {
    return (
      <div
        aria-hidden="true"
        data-testid="invitation-backdrop-effect"
        data-effect={effect}
        className={`pointer-events-none ${positionClass} z-[2] overflow-hidden`}
      >
        {SPARKLE_PARTICLES.map((p, idx) => (
          <span
            key={idx}
            className="inv-ambient-sparkle absolute"
            style={
              {
                left: `${p.leftPercent}%`,
                top: `${p.topPercent}%`,
                width: `${p.sizePx}px`,
                height: `${p.sizePx}px`,
                color: idx % 3 === 0 ? accentHex : p.color,
                '--inv-p-duration': `${p.durationSec}s`,
                '--inv-p-delay': `${p.delaySec}s`,
              } as CSSProperties
            }
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full">
              <path d="M12 1L14.6 9.4L23 12L14.6 14.6L12 23L9.4 14.6L1 12L9.4 9.4L12 1Z" />
            </svg>
          </span>
        ))}
      </div>
    );
  }

  const particles = effect === 'falling_leaves' ? LEAF_PARTICLES : PETAL_PARTICLES;

  return (
    <div
      aria-hidden="true"
      data-testid="invitation-backdrop-effect"
      data-effect={effect}
      className={`pointer-events-none ${positionClass} z-[2] overflow-hidden`}
    >
      {particles.map((p, idx) => (
        <span
          key={idx}
          className="inv-ambient-fall absolute"
          style={
            {
              left: `${p.leftPercent}%`,
              top: `${p.topPercent}%`,
              width: `${p.sizePx}px`,
              height: `${p.sizePx}px`,
              color: p.color,
              '--inv-p-duration': `${p.durationSec}s`,
              '--inv-p-delay': `${p.delaySec}s`,
              '--inv-p-sway': `${p.swayPx}px`,
            } as CSSProperties
          }
        >
          {effect === 'falling_leaves' ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full opacity-75">
              <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22L6.66 19.7C7.14 19.87 7.64 20 8 20C19 20 22 3 22 3C21 5 14 5.25 9 6.25C4 7.25 2 11.5 2 13.5C2 15.5 3.75 17.25 3.75 17.25C7 8 17 8 17 8Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full opacity-80">
              <path d="M12 2C9.2 5.2 6 8.8 6 13.2C6 16.9 8.7 20 12 20C15.3 20 18 16.9 18 13.2C18 8.8 14.8 5.2 12 2Z" />
            </svg>
          )}
        </span>
      ))}
    </div>
  );
}
