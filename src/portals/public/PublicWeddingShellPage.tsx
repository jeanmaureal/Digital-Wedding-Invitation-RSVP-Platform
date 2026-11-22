import { useQuery } from '@tanstack/react-query';
import { Lock, RefreshCw } from 'lucide-react';
import { type JSX, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InvitationRenderer } from '@/features/design/components/InvitationRenderer';
import {
  fetchPublicWeddingBySlug,
  isValidPublicWeddingSlug,
  type PublicWeddingLookupResult,
} from '@/features/publishing/api/publicWeddingApi';
import { publishingQueryKeys } from '@/features/publishing/queryKeys';
import { ROUTES } from '@/lib/constants/routes';
import { getPublicSupabaseClient, type TypedSupabaseClient } from '@/lib/supabase/publicClient';

export interface PublicWeddingShellPageProps {
  readonly client?: TypedSupabaseClient | null | undefined;
}

export function PublicWeddingShellPage({ client }: PublicWeddingShellPageProps = {}): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const isValidSlug = isValidPublicWeddingSlug(slug);
  const resolvedClient = client === undefined ? getPublicSupabaseClient() : client;
  const hasPublicClient = resolvedClient !== null;

  const [showRsvpGuidance, setShowRsvpGuidance] = useState(false);

  const publicQuery = useQuery<PublicWeddingLookupResult>({
    queryKey: publishingQueryKeys.publicBySlug(slug ?? ''),
    queryFn: () => fetchPublicWeddingBySlug(slug, resolvedClient),
    enabled: isValidSlug && hasPublicClient,
    retry: false,
  });

  const publishedTitle =
    publicQuery.data?.status === 'published' ? publicQuery.data.document.wedding.title : null;

  useEffect(() => {
    if (!publishedTitle) {
      return;
    }
    const previousTitle = document.title;
    document.title = `${publishedTitle} — Wedding Invitation`;
    return () => {
      document.title = previousTitle;
    };
  }, [publishedTitle]);

  if (!isValidSlug) {
    return (
      <section
        data-testid="route-public-wedding"
        aria-labelledby="wedding-shell-heading"
        className="flex flex-1 items-center justify-center px-6 py-12"
      >
        <Card className="mx-auto max-w-xl" data-testid="public-wedding-invalid-slug">
          <CardHeader>
            <div className="mb-2">
              <Badge variant="outline">Public Wedding Website</Badge>
            </div>
            <CardTitle asChild>
              <h1 id="wedding-shell-heading" className="text-2xl">
                Invalid Wedding Link
              </h1>
            </CardTitle>
            <CardDescription>
              The requested wedding address is not a valid invitation link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Only active published wedding snapshots are served publicly. Draft configurations and
              guest records remain private.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to={ROUTES.home}>Return to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (hasPublicClient && publicQuery.isPending) {
    return (
      <section
        data-testid="route-public-wedding"
        aria-label="Loading wedding invitation"
        className="flex flex-1 items-center justify-center px-6 py-12"
      >
        <Card className="mx-auto max-w-xl" data-testid="public-wedding-loading">
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            Loading wedding invitation…
          </CardContent>
        </Card>
      </section>
    );
  }

  if (hasPublicClient && (publicQuery.isError || publicQuery.data?.status === 'schema_invalid')) {
    return (
      <section
        data-testid="route-public-wedding"
        aria-labelledby="wedding-error-heading"
        className="flex flex-1 items-center justify-center px-6 py-12"
      >
        <Card className="mx-auto max-w-xl" role="alert" data-testid="public-wedding-error">
          <CardHeader>
            <div className="mb-2">
              <Badge variant="outline">Public Wedding Website</Badge>
            </div>
            <CardTitle asChild>
              <h1 id="wedding-error-heading" className="text-2xl">
                Unable to Display Invitation
              </h1>
            </CardTitle>
            <CardDescription>
              We encountered an issue loading this wedding website. Please try again in a moment.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void publicQuery.refetch()}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Retry
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to={ROUTES.home}>Return to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (publicQuery.data?.status === 'invite_only') {
    return (
      <section
        data-testid="route-public-wedding"
        aria-labelledby="wedding-invite-only-heading"
        className="flex flex-1 items-center justify-center px-6 py-12"
      >
        <Card className="mx-auto max-w-xl" data-testid="public-wedding-invite-only">
          <CardHeader>
            <div className="mb-2">
              <Badge variant="secondary" className="gap-1.5">
                <Lock className="size-3.5" aria-hidden="true" />
                Invite-Only Celebration
              </Badge>
            </div>
            <CardTitle asChild>
              <h1 id="wedding-invite-only-heading" className="text-2xl">
                Private Wedding Celebration
              </h1>
            </CardTitle>
            <CardDescription>
              Full event details and RSVP access for this celebration are shared privately with
              invited households.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              If you received a personal household invitation link or QR card from the couple,
              please open that direct invitation link to view celebration details and respond.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to={ROUTES.home}>Return to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (publicQuery.data?.status === 'published') {
    const { document: invitationDoc, versionNumber } = publicQuery.data;
    const isRoyalBotanical = invitationDoc.theme.presetId === 'royal_botanical';

    return (
      <section
        data-testid="route-public-wedding"
        data-published-version={versionNumber}
        aria-label={`${invitationDoc.wedding.title} wedding invitation`}
        className={
          isRoyalBotanical
            ? 'flex min-h-screen w-full flex-col bg-[#F5F0E3]'
            : 'mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-12'
        }
      >
        {showRsvpGuidance ? (
          <div className={isRoyalBotanical ? 'px-4 pt-4' : ''}>
            <Card
              role="status"
              data-testid="public-rsvp-guidance-card"
              className="bg-background/95 relative z-20 mx-auto max-w-2xl border-emerald-500/30 backdrop-blur-sm"
            >
              <CardContent className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    {invitationDoc.wedding.isRsvpOpen
                      ? 'Responding for Your Household'
                      : 'Online RSVPs Are Currently Closed'}
                  </p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {invitationDoc.wedding.isRsvpOpen
                      ? 'To confirm attendance, please open the personal household invitation link (/i/…) shared directly with you by the couple.'
                      : 'Please reach out to the couple directly if you need to update your attendance details.'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRsvpGuidance(false)}
                >
                  Dismiss
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <InvitationRenderer
          document={invitationDoc}
          viewportMode="desktop"
          backdropMode="page"
          onPrimaryRsvpAction={() => setShowRsvpGuidance(true)}
        />
      </section>
    );
  }

  // Unavailable (draft, archived, unknown slug) or offline unconfigured fallback
  return (
    <section
      data-testid="route-public-wedding"
      aria-labelledby="wedding-shell-heading"
      className="flex flex-1 items-center justify-center px-6 py-12"
    >
      <Card className="mx-auto max-w-xl" data-testid="public-wedding-unavailable">
        <CardHeader>
          <div className="mb-2">
            <Badge variant="outline">Public Wedding Website</Badge>
          </div>
          <CardTitle asChild>
            <h1 id="wedding-shell-heading" className="text-2xl">
              Invitation Not Yet Available
            </h1>
          </CardTitle>
          <CardDescription>No published wedding snapshot exists for this link yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Only active published wedding snapshots are served publicly. Draft configurations and
            guest records remain private.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to={ROUTES.home}>Return to Home</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
