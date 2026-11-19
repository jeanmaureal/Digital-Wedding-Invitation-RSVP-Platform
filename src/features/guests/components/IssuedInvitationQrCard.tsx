import { Check, Copy, Download, QrCode, ShieldCheck, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { type JSX, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { buildPublicInvitationPath } from '@/lib/constants/routes';

export interface IssuedInvitationQrCardProps {
  readonly householdName: string;
  readonly rawToken: string;
  readonly expiresAt: string | null;
  readonly onDismiss: () => void;
}

function toSafeFilenameSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'household';
}

export function IssuedInvitationQrCard({
  householdName,
  rawToken,
  expiresAt,
  onDismiss,
}: IssuedInvitationQrCardProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const qrContainerRef = useRef<HTMLDivElement | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const relativePath = buildPublicInvitationPath(rawToken);
  const fullInvitationUrl = `${origin}${relativePath}`;

  async function handleCopyLink(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(fullInvitationUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  }

  function handleDownloadQrSvg(): void {
    const svgElement = qrContainerRef.current?.querySelector('svg');
    if (!svgElement) {
      return;
    }

    const serializedSvg = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([serializedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(svgBlob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${toSafeFilenameSlug(householdName)}-invitation-qr.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <Card
      data-testid="issued-invitation-qr-card"
      className="border-emerald-600/40 bg-emerald-500/5"
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                One-Time Hashed Link Issued
              </Badge>
              {expiresAt ? (
                <Badge variant="outline">
                  Expires {new Date(expiresAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                </Badge>
              ) : (
                <Badge variant="outline">No Expiration</Badge>
              )}
            </div>
            <CardTitle className="text-lg">
              Personal Invitation Link &amp; QR for {householdName}
            </CardTitle>
            <CardDescription>
              Copy this link or download the printable QR code now. For guest privacy, PostgreSQL
              stores only a SHA-256 hash — this raw link will not be shown again once dismissed,
              though you can rotate a new link anytime.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            data-testid="dismiss-issued-qr-button"
          >
            <X className="size-4" aria-hidden="true" />
            Done
          </Button>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="issued-invitation-url-input" className="text-xs font-medium">
              Household Invitation URL
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="issued-invitation-url-input"
                data-testid="issued-invitation-url-input"
                readOnly
                value={fullInvitationUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => void handleCopyLink()}
                data-testid="copy-issued-invitation-link-button"
              >
                {copied ? (
                  <>
                    <Check className="size-4" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4" aria-hidden="true" />
                    Copy Link
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadQrSvg}
              data-testid="download-issued-qr-svg-button"
            >
              <Download className="size-4" aria-hidden="true" />
              Download QR (.svg)
            </Button>
          </div>
        </div>

        <div className="bg-background flex flex-col items-center gap-2 rounded-lg border p-3 shadow-xs">
          <div ref={qrContainerRef} data-testid="issued-invitation-qr-svg">
            <QRCodeSVG
              value={fullInvitationUrl}
              size={152}
              level="M"
              marginSize={2}
              title={`QR invitation link for ${householdName}`}
            />
          </div>
          <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
            <QrCode className="size-3" aria-hidden="true" />
            Scan for /i/… access
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
