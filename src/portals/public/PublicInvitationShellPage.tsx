import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { type JSX, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InvitationRenderer } from '@/features/design/components/InvitationRenderer';
import { formatInvitationEventDate } from '@/features/design/themes/dateFormatting';
import { fetchPublicInvitationByToken } from '@/features/guests/api/publicInvitationApi';
import { guestQueryKeys } from '@/features/guests/queryKeys';
import {
  isValidPublicInvitationToken,
  type PublicInvitationLookupResult,
} from '@/features/guests/schemas/publicInvitationSchemas';
import { HouseholdRsvpFormCard } from '@/features/rsvp/components/public/HouseholdRsvpFormCard';
import { RoyalBotanicalRsvpDialog } from '@/features/rsvp/components/public/RoyalBotanicalRsvpDialog';
import { ROUTES } from '@/lib/constants/routes';
import { getPublicSupabaseClient, type TypedSupabaseClient } from '@/lib/supabase/publicClient';

export interface PublicInvitationShellPageProps {
  readonly client?: TypedSupabaseClient | null | undefined;
}

export function PublicInvitationShellPage({
  client,
}: PublicInvitationShellPageProps = {}): JSX.Element {
  // Security boundary (`docs/security-baseline.md` §3): raw `:token` route parameters
  // are NEVER rendered into DOM output, error descriptions, or console logs.
  const { token } = useParams<{ token: string }>();
  const isValidFormat = isValidPublicInvitationToken(token);
  const resolvedClient = client === undefined ? getPublicSupabaseClient() : client;
  const hasPublicClient = resolvedClient !== null;

  const [showRsvpNotice, setShowRsvpNotice] = useState(false);
  const [isRsvpDialogOpen, setIsRsvpDialogOpen] = useState(false);

  const invitationQuery = useQuery<PublicInvitationLookupResult>({
    queryKey: guestQueryKeys.publicByToken(token ?? ''),
    queryFn: () => fetchPublicInvitationByToken(token, resolvedClient),
    enabled: isValidFormat && hasPublicClient,
    retry: false,
  });

  const activeData = invitationQuery.data?.status === 'active' ? invitationQuery.data : null;

  useEffect(() => {
    if (!activeData) {
      return;
    }
    const previousTitle = document.title;
    document.title = `${activeData.document.wedding.title} — Invitation for ${activeData.household.displayName}`;
    return () => {
      document.title = previousTitle;
    };
  }, [activeData]);

  function handleScrollToHouseholdRsvp(): void {
    setShowRsvpNotice(true);
    const target = document.getElementById('household-rsvp-section');
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  if (!isValidFormat || invitationQuery.data?.status === 'invalid_token') {
    return (
      <section
        data-testid="route-public-invitation"
        aria-labelledby="invitation-invalid-heading"
        className="flex flex-1 items-center justify-center px-6 py-12"
      >
        <Card className="mx-auto max-w-xl" data-testid="public-invitation-invalid-token">
          <CardHeader>
            <div className="mb-2">
              <Badge variant="outline">Guest RSVP Access</Badge>
            </div>
            <CardTitle asChild>
              <h1 id="invitation-invalid-heading" className="text-2xl">
                Invalid Invitation Link
              </h1>
            </CardTitle>
            <CardDescription>
              This personal invitation address does not match a valid household invitation format.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Please open the complete link or scan the QR card shared directly with your household
              by the couple.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to={ROUTES.home}>Return to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (hasPublicClient && invitationQuery.isPending) {
    return (
      <section
        data-testid="route-public-invitation"
        aria-label="Verifying household invitation"
        className="flex flex-1 items-center justify-center px-6 py-12"
      >
        <Card className="mx-auto max-w-xl" data-testid="public-invitation-loading">
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            Verifying your household invitation…
          </CardContent>
        </Card>
      </section>
    );
  }

  if (
    hasPublicClient &&
    (invitationQuery.isError || invitationQuery.data?.status === 'schema_invalid')
  ) {
    return (
      <section
        data-testid="route-public-invitation"
        aria-labelledby="invitation-error-heading"
        className="flex flex-1 items-center justify-center px-6 py-12"
      >
        <Card className="mx-auto max-w-xl" role="alert" data-testid="public-invitation-error">
          <CardHeader>
            <div className="mb-2">
              <Badge variant="outline">Guest RSVP Access</Badge>
            </div>
            <CardTitle asChild>
              <h1 id="invitation-error-heading" className="text-2xl">
                Unable to Verify Invitation
              </h1>
            </CardTitle>
            <CardDescription>
              We encountered a temporary issue verifying this household invitation link.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void invitationQuery.refetch()}
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

  if (activeData) {
    const { document: invitationDoc, household, rsvp, versionNumber } = activeData;
    const isRoyalBotanical = invitationDoc.theme.presetId === 'royal_botanical';

    if (isRoyalBotanical) {
      return (
        <section
          data-testid="route-public-invitation"
          data-published-version={versionNumber}
          aria-label={`Personal wedding invitation for ${household.displayName}`}
          className="flex min-h-screen w-full flex-col bg-[#F5F0E3]"
        >
          <InvitationRenderer
            document={invitationDoc}
            viewportMode="desktop"
            backdropMode="page"
            household={{
              displayName: household.displayName,
              maxAttendees: household.maxAttendees,
            }}
            onPrimaryRsvpAction={() => setIsRsvpDialogOpen(true)}
          />

          <RoyalBotanicalRsvpDialog
            key={`rb-rsvp-dialog:${versionNumber}:${household.displayName}`}
            isOpen={isRsvpDialogOpen}
            onClose={() => setIsRsvpDialogOpen(false)}
            rawToken={token}
            partnerOneName={invitationDoc.wedding.partnerOneName}
            partnerTwoName={invitationDoc.wedding.partnerTwoName}
            eventDateLabel={formatInvitationEventDate(invitationDoc.wedding.eventDate)}
            household={household}
            rsvp={rsvp}
            client={resolvedClient}
          />
        </section>
      );
    }

    return (
      <section
        data-testid="route-public-invitation"
        data-published-version={versionNumber}
        aria-label={`Personal wedding invitation for ${household.displayName}`}
        className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-12"
      >
        <Card
          data-testid="public-invitation-household-card"
          className="bg-background/95 relative z-10 mx-auto max-w-3xl border-emerald-600/30 backdrop-blur-sm"
        >
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Verified Household Invitation
              </Badge>
              <Badge variant="outline" data-testid="public-invitation-capacity-badge">
                Reserved for up to {household.maxAttendees}{' '}
                {household.maxAttendees === 1 ? 'guest' : 'guests'}
              </Badge>
            </div>
            <CardTitle className="mt-1 text-2xl" data-testid="public-invitation-welcome-heading">
              Welcome, {household.displayName}
            </CardTitle>
            <CardDescription>
              You are viewing your household&rsquo;s personal invitation for{' '}
              <strong>{invitationDoc.wedding.title}</strong>.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {household.guests.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <Users className="size-3.5" aria-hidden="true" />
                  Invited Household Members
                </p>
                <ul
                  data-testid="public-invitation-guest-list"
                  className="flex flex-wrap gap-2 text-xs"
                >
                  {household.guests.map((guest) => (
                    <li
                      key={guest.id}
                      className="bg-background inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium"
                    >
                      <span>
                        {guest.firstName} {guest.lastName}
                      </span>
                      {guest.isChild ? (
                        <span className="text-muted-foreground text-[11px]">(Child)</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {showRsvpNotice ? (
              <div
                role="status"
                data-testid="public-invitation-rsvp-status-banner"
                className="bg-background flex flex-col justify-between gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"
              >
                <div className="space-y-0.5 text-xs">
                  <p className="font-semibold">
                    {rsvp.isAcceptingResponses
                      ? `Household RSVP Verified (${household.displayName} — up to ${household.maxAttendees} ${household.maxAttendees === 1 ? 'attendee' : 'attendees'})`
                      : 'Online RSVPs Are Currently Closed'}
                  </p>
                  <p className="text-muted-foreground">
                    {rsvp.isAcceptingResponses
                      ? 'Complete and submit your household attendance form directly below the invitation.'
                      : 'Please reach out to the couple directly if you need to update your attendance details.'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRsvpNotice(false)}
                >
                  Dismiss
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <InvitationRenderer
          document={invitationDoc}
          viewportMode="desktop"
          backdropMode="page"
          onPrimaryRsvpAction={handleScrollToHouseholdRsvp}
        />

        <div className="relative z-10">
          <HouseholdRsvpFormCard
            key={`rsvp-form:${versionNumber}:${household.displayName}`}
            rawToken={token}
            weddingTitle={invitationDoc.wedding.title}
            household={household}
            rsvp={rsvp}
            client={resolvedClient}
          />
        </div>
      </section>
    );
  }

  // Unavailable (unknown, revoked, expired, unpublished wedding) or offline unconfigured fallback
  return (
    <section
      data-testid="route-public-invitation"
      aria-labelledby="invitation-shell-heading"
      className="flex flex-1 items-center justify-center px-6 py-12"
    >
      <Card className="mx-auto max-w-xl" data-testid="public-invitation-unavailable">
        <CardHeader>
          <div className="mb-2">
            <Badge variant="outline">Guest RSVP Access</Badge>
          </div>
          <CardTitle asChild>
            <h1 id="invitation-shell-heading" className="text-2xl">
              Invitation Link Unavailable
            </h1>
          </CardTitle>
          <CardDescription>
            This household invitation link is inactive, expired, or belongs to an unpublished
            celebration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            If you received an invitation link from the couple, please ask them for an updated link
            or check back once the wedding website is published. No guest or household details are
            displayed for unverified links.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to={ROUTES.home}>Return to Home</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
