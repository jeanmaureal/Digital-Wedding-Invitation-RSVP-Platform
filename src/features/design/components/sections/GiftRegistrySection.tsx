import { ArrowUp, Check, Copy, QrCode } from 'lucide-react';
import { type JSX, useEffect, useRef, useState } from 'react';
import { OrnamentDivider } from '@/features/design/components/sections/OrnamentDivider';
import type {
  GiftAccountItem,
  GiftRegistrySectionContent,
} from '@/features/design/schemas/designSchemas';
import type { OrnamentStyleId } from '@/features/design/themes/themePresets';

export interface GiftRegistrySectionProps {
  readonly content: GiftRegistrySectionContent;
  readonly ornamentStyle: OrnamentStyleId;
}

function parseInstructionSteps(raw: string): readonly string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\d+[.)]\s*/, ''))
    .filter((line) => line.length > 0);
}

function AccountGiftCard({ account }: { readonly account: GiftAccountItem }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopyAccountNumber = async () => {
    if (!account.accountNumber || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(account.accountNumber);
      setCopied(true);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard permission errors in restricted contexts
    }
  };

  const steps = parseInstructionSteps(account.instructions);
  const hasAccountDetails = Boolean(
    account.accountNumber || account.accountHolderName || account.providerName,
  );
  const hasQrOrInstructions = Boolean(
    account.qrCodeImageUrl || steps.length > 0 || account.disclaimer,
  );

  return (
    <div className="space-y-6" data-testid={`gift-account-panel-${account.id}`}>
      {hasAccountDetails ? (
        <div
          className="mx-auto max-w-sm border-y py-5"
          style={{ borderColor: 'var(--inv-border)' }}
        >
          <p
            className="text-[11px] font-medium tracking-[0.2em] uppercase"
            style={{ color: 'var(--inv-ink-muted)' }}
          >
            {account.accountLabel || `${account.providerName} Number`}
          </p>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
            <span
              className="text-sm font-semibold tracking-wide"
              style={{ color: 'var(--inv-accent)' }}
            >
              {account.providerName}
            </span>

            {account.accountNumber ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  data-testid="gift-account-number"
                  className="text-base font-medium tracking-wide sm:text-lg"
                  style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
                >
                  {account.accountNumber}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyAccountNumber()}
                  aria-label={`Copy ${account.providerName} account number`}
                  data-testid="copy-gift-account-number"
                  className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80"
                  style={{
                    borderColor: 'var(--inv-border)',
                    color: 'var(--inv-ink-muted)',
                    backgroundColor: 'var(--inv-surface)',
                  }}
                >
                  {copied ? (
                    <>
                      <Check className="size-3" aria-hidden="true" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" aria-hidden="true" />
                      Copy
                    </>
                  )}
                </button>
              </span>
            ) : null}
          </div>

          {account.accountHolderName ? (
            <p className="mt-1.5 text-xs sm:text-sm" style={{ color: 'var(--inv-ink-muted)' }}>
              Name: <span style={{ color: 'var(--inv-ink)' }}>{account.accountHolderName}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {hasQrOrInstructions ? (
        <div
          data-testid="gift-qr-card"
          className="mx-auto max-w-xs border bg-white px-5 py-6 text-neutral-900 shadow-xs sm:max-w-sm sm:px-6"
          style={{
            borderColor: 'var(--inv-border)',
            borderRadius: 'var(--inv-radius)',
          }}
        >
          <p className="text-[11px] font-semibold tracking-[0.18em] text-neutral-700 uppercase">
            {account.qrHeading || 'Scan to Send a Monetary Gift'}
          </p>

          {account.qrCodeImageUrl ? (
            <div className="mx-auto my-4 aspect-square w-52 max-w-full overflow-hidden border border-neutral-200 bg-white p-2 sm:w-56">
              <img
                src={account.qrCodeImageUrl}
                alt={`${account.providerName} QR code`}
                data-testid="gift-qr-image"
                loading="lazy"
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <div
              data-testid="gift-qr-placeholder"
              className="mx-auto my-4 flex aspect-square w-44 max-w-full flex-col items-center justify-center gap-2 border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center text-neutral-400"
            >
              <QrCode className="size-10 opacity-60" aria-hidden="true" />
              <span className="text-[11px] leading-snug">
                Upload a {account.providerName} QR code in the builder to display it here
              </span>
            </div>
          )}

          {steps.length > 0 ? (
            <div className="mt-4 border border-amber-200/70 bg-[#FAF7F0] px-4 py-3.5 text-left">
              <p className="text-center text-[10px] font-semibold tracking-[0.18em] text-neutral-700 uppercase">
                {account.instructionsTitle || 'How to Send Your Gift'}
              </p>
              <ol className="mt-2.5 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-neutral-700">
                {steps.map((step, index) => (
                  <li key={`${index}-${step.slice(0, 16)}`}>{step}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {account.disclaimer ? (
            <p className="mt-3.5 text-[11px] leading-relaxed text-neutral-500">
              {account.disclaimer}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function GiftRegistrySection({
  content,
  ornamentStyle,
}: GiftRegistrySectionProps): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [selectedAccountIndex, setSelectedAccountIndex] = useState(0);

  const safeIndex =
    selectedAccountIndex < content.accounts.length ? selectedAccountIndex : 0;
  const activeAccount = content.accounts[safeIndex] ?? null;

  const handleReturnToTop = () => {
    const invitationArticle = sectionRef.current?.closest('article');
    if (invitationArticle && typeof invitationArticle.scrollIntoView === 'function') {
      invitationArticle.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <section
      ref={sectionRef}
      data-testid="invitation-section-gift_registry"
      className="border-b px-6 py-14 text-center sm:px-12"
      style={{
        backgroundColor: 'var(--inv-surface)',
        borderColor: 'var(--inv-border)',
      }}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Outer editorial header */}
        <div className="space-y-2.5">
          {content.eyebrow ? (
            <p
              className="text-[11px] font-medium tracking-[0.24em] uppercase"
              style={{ color: 'var(--inv-accent)' }}
            >
              {content.eyebrow}
            </p>
          ) : null}

          <h2
            className="text-3xl leading-tight font-normal sm:text-4xl"
            style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
          >
            {content.heading}
          </h2>

          <OrnamentDivider styleId={ornamentStyle} />

          {content.introMessage ? (
            <p
              className="mx-auto max-w-lg text-sm leading-relaxed whitespace-pre-line sm:text-base"
              style={{ color: 'var(--inv-ink-muted)' }}
            >
              {content.introMessage}
            </p>
          ) : null}
        </div>

        {/* Framed couple note & monetary gift card */}
        <div
          data-testid="gift-couple-note-card"
          className="mx-auto max-w-xl space-y-6 border px-5 py-9 sm:px-10 sm:py-11"
          style={{
            backgroundColor: 'var(--inv-surface-muted)',
            borderColor: 'var(--inv-border)',
            borderRadius: 'var(--inv-radius)',
          }}
        >
          <div className="space-y-2.5">
            {content.noteEyebrow ? (
              <p
                className="text-[11px] font-medium tracking-[0.22em] uppercase"
                style={{ color: 'var(--inv-accent)' }}
              >
                {content.noteEyebrow}
              </p>
            ) : null}

            {content.noteHeading ? (
              <h3
                className="text-xl leading-snug font-semibold sm:text-2xl"
                style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
              >
                {content.noteHeading}
              </h3>
            ) : null}

            {content.noteMessage ? (
              <p
                className="mx-auto max-w-md text-sm leading-relaxed whitespace-pre-line"
                style={{ color: 'var(--inv-ink-muted)' }}
              >
                {content.noteMessage}
              </p>
            ) : null}
          </div>

          {content.accounts.length > 1 ? (
            <div
              role="tablist"
              aria-label="Gift payment options"
              className="flex flex-wrap items-center justify-center gap-2 pt-1"
            >
              {content.accounts.map((account, idx) => {
                const isSelected = idx === safeIndex;
                return (
                  <button
                    key={account.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    data-testid={`gift-account-tab-${account.id}`}
                    onClick={() => setSelectedAccountIndex(idx)}
                    className="border px-3.5 py-1.5 text-xs font-medium tracking-wide transition-colors"
                    style={{
                      borderRadius: 'var(--inv-radius)',
                      borderColor: isSelected ? 'var(--inv-accent)' : 'var(--inv-border)',
                      backgroundColor: isSelected ? 'var(--inv-accent)' : 'var(--inv-surface)',
                      color: isSelected ? 'var(--inv-accent-contrast)' : 'var(--inv-ink)',
                    }}
                  >
                    {account.providerName}
                  </button>
                );
              })}
            </div>
          ) : null}

          {activeAccount ? <AccountGiftCard key={activeAccount.id} account={activeAccount} /> : null}
        </div>

        {/* Return to the Invitation button */}
        {content.showReturnToTop ? (
          <div className="pt-2">
            <button
              type="button"
              onClick={handleReturnToTop}
              data-testid="gift-return-to-top-button"
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-medium tracking-[0.16em] uppercase transition-opacity hover:opacity-90"
              style={{
                backgroundColor: 'var(--inv-accent)',
                color: 'var(--inv-accent-contrast)',
                borderRadius: 'var(--inv-radius)',
              }}
            >
              <span>{content.returnToTopLabel || 'Return to the Invitation'}</span>
              <ArrowUp className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
