import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  ShieldBan,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { type JSX, useDeferredValue, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { translateGuestError } from '@/features/guests/api/guestErrors';
import {
  createGuestMember,
  createHouseholdGroup,
  deleteGuestMember,
  deleteHouseholdGroup,
  fetchWeddingGuestDirectory,
  importOrganizerWeddingGuests,
  issueOrganizerHouseholdInvitation,
  revokeOrganizerHouseholdInvitation,
  updateGuestMember,
  updateHouseholdGroup,
  updateOrganizerHouseholdInvitation,
} from '@/features/guests/api/organizerGuestsApi';
import { CsvGuestImportCard } from '@/features/guests/components/CsvGuestImportCard';
import { GuestMemberEditorPanel } from '@/features/guests/components/GuestMemberEditorPanel';
import { HouseholdEditorPanel } from '@/features/guests/components/HouseholdEditorPanel';
import { IssuedInvitationQrCard } from '@/features/guests/components/IssuedInvitationQrCard';
import { guestQueryKeys } from '@/features/guests/queryKeys';
import {
  GUEST_SIDE_LABELS,
  type GuestMemberFormValues,
  type GuestRow,
  type HouseholdFormValues,
  type HouseholdWithDetails,
  type ImportedHouseholdPayload,
  INVITATION_DELIVERY_LABELS,
} from '@/features/guests/schemas/guestSchemas';
import { buildGuestDirectoryCsv } from '@/features/guests/utils/guestDirectoryCsvExport';
import type { WorkspaceRole } from '@/features/workspace/schemas/workspaceSchemas';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';
import { buildSafeCsvFilename, downloadCsvFile } from '@/lib/utilities/csvExport';
import type { Tables } from '@/types/database.types';

export interface WeddingGuestDirectoryManagerProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly callerRole: WorkspaceRole;
  readonly wedding: Tables<'weddings'>;
  readonly client?: TypedSupabaseClient | null;
}

interface OneTimeQrState {
  readonly groupId: string;
  readonly householdName: string;
  readonly rawToken: string;
  readonly expiresAt: string | null;
}

function canEditGuests(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

function formatDateInputValue(isoInstant: string | null): string {
  if (!isoInstant) {
    return '';
  }
  return isoInstant.slice(0, 10);
}

function parseDateInputToFutureEndOfDayIso(dateText: string): string | null {
  const trimmed = dateText.trim();
  if (!trimmed) {
    return null;
  }
  return `${trimmed}T23:59:59.000Z`;
}

export function WeddingGuestDirectoryManager({
  userId,
  workspaceId,
  callerRole,
  wedding,
  client,
}: WeddingGuestDirectoryManagerProps): JSX.Element {
  const queryClient = useQueryClient();
  const isWritable = canEditGuests(callerRole);
  const directoryKey = guestQueryKeys.directory(userId, workspaceId, wedding.id);

  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [showCreateHousehold, setShowCreateHousehold] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);
  const [addingGuestForGroupId, setAddingGuestForGroupId] = useState<string | null>(null);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [oneTimeQrState, setOneTimeQrState] = useState<OneTimeQrState | null>(null);
  const [expiryDraftByGroupId, setExpiryDraftByGroupId] = useState<Record<string, string>>({});
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const directoryQuery = useQuery({
    queryKey: directoryKey,
    queryFn: () =>
      fetchWeddingGuestDirectory({
        workspaceId,
        weddingId: wedding.id,
        ...(client !== undefined ? { client } : {}),
      }),
    enabled: Boolean(userId && workspaceId && wedding.id),
  });

  async function invalidateDirectory(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: directoryKey });
  }

  const createGroupMutation = useMutation({
    mutationFn: (values: HouseholdFormValues) =>
      createHouseholdGroup({
        workspaceId,
        weddingId: wedding.id,
        values,
        sortOrder: directoryQuery.data?.totalHouseholds ?? 0,
        ...(client !== undefined ? { client } : {}),
      }),
    onSuccess: async (created) => {
      setShowCreateHousehold(false);
      setActionError(null);
      setActionFeedback(`Created household "${created.display_name}".`);
      await invalidateDirectory();
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: (params: { readonly groupId: string; readonly values: HouseholdFormValues }) =>
      updateHouseholdGroup({
        workspaceId,
        weddingId: wedding.id,
        groupId: params.groupId,
        values: params.values,
        ...(client !== undefined ? { client } : {}),
      }),
    onSuccess: async (updated) => {
      setEditingGroupId(null);
      setActionError(null);
      setActionFeedback(`Updated household "${updated.display_name}".`);
      await invalidateDirectory();
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) =>
      deleteHouseholdGroup({
        workspaceId,
        weddingId: wedding.id,
        groupId,
        ...(client !== undefined ? { client } : {}),
      }),
    onSuccess: async (_, deletedGroupId) => {
      setConfirmDeleteGroupId(null);
      if (oneTimeQrState?.groupId === deletedGroupId) {
        setOneTimeQrState(null);
      }
      setActionError(null);
      setActionFeedback('Deleted household group and cascaded its guests and links.');
      await invalidateDirectory();
    },
    onError: (err) => {
      setActionError(translateGuestError(err).message);
    },
  });

  const createGuestMutation = useMutation({
    mutationFn: (params: {
      readonly groupId: string;
      readonly values: GuestMemberFormValues;
      readonly sortOrder: number;
    }) =>
      createGuestMember({
        workspaceId,
        weddingId: wedding.id,
        groupId: params.groupId,
        values: params.values,
        sortOrder: params.sortOrder,
        ...(client !== undefined ? { client } : {}),
      }),
    onSuccess: async (created) => {
      setAddingGuestForGroupId(null);
      setActionError(null);
      setActionFeedback(`Added ${created.first_name} ${created.last_name}`.trim() + '.');
      await invalidateDirectory();
    },
  });

  const updateGuestMutation = useMutation({
    mutationFn: (params: {
      readonly groupId: string;
      readonly guestId: string;
      readonly values: GuestMemberFormValues;
    }) =>
      updateGuestMember({
        workspaceId,
        weddingId: wedding.id,
        groupId: params.groupId,
        guestId: params.guestId,
        values: params.values,
        ...(client !== undefined ? { client } : {}),
      }),
    onSuccess: async () => {
      setEditingGuestId(null);
      setActionError(null);
      setActionFeedback('Saved guest details.');
      await invalidateDirectory();
    },
  });

  const deleteGuestMutation = useMutation({
    mutationFn: (params: { readonly groupId: string; readonly guestId: string }) =>
      deleteGuestMember({
        workspaceId,
        weddingId: wedding.id,
        groupId: params.groupId,
        guestId: params.guestId,
        ...(client !== undefined ? { client } : {}),
      }),
    onSuccess: async () => {
      setActionError(null);
      setActionFeedback('Removed guest from household.');
      await invalidateDirectory();
    },
    onError: (err) => {
      setActionError(translateGuestError(err).message);
    },
  });

  const csvImportMutation = useMutation({
    mutationFn: (households: readonly ImportedHouseholdPayload[]) =>
      importOrganizerWeddingGuests({
        workspaceId,
        weddingId: wedding.id,
        households,
        ...(client !== undefined ? { client } : {}),
      }),
    onSuccess: async (summary) => {
      setShowCsvImport(false);
      setActionError(null);
      setActionFeedback(
        `Imported ${summary.importedGroupCount} ${summary.importedGroupCount === 1 ? 'household' : 'households'} (${summary.importedGuestCount} ${summary.importedGuestCount === 1 ? 'guest' : 'guests'}).`,
      );
      await invalidateDirectory();
    },
  });

  const issueTokenMutation = useMutation({
    mutationFn: (params: {
      readonly groupId: string;
      readonly householdName: string;
      readonly expiresAt: string | null;
    }) =>
      issueOrganizerHouseholdInvitation({
        workspaceId,
        weddingId: wedding.id,
        groupId: params.groupId,
        expiresAt: params.expiresAt,
        ...(client !== undefined ? { client } : {}),
      }),
    onSuccess: async (issued, variables) => {
      setOneTimeQrState({
        groupId: variables.groupId,
        householdName: variables.householdName,
        rawToken: issued.rawToken,
        expiresAt: issued.invitation.expires_at,
      });
      setActionError(null);
      setActionFeedback(
        `Issued a fresh 256-bit invitation link & QR code for "${variables.householdName}".`,
      );
      await invalidateDirectory();
    },
    onError: (err) => {
      setActionError(translateGuestError(err).message);
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (params: { readonly groupId: string; readonly invitationId: string }) =>
      revokeOrganizerHouseholdInvitation({
        workspaceId,
        weddingId: wedding.id,
        invitationId: params.invitationId,
        ...(client !== undefined ? { client } : {}),
      }),
    onSuccess: async (_, variables) => {
      if (oneTimeQrState?.groupId === variables.groupId) {
        setOneTimeQrState(null);
      }
      setActionError(null);
      setActionFeedback('Revoked household invitation link immediately.');
      await invalidateDirectory();
    },
    onError: (err) => {
      setActionError(translateGuestError(err).message);
    },
  });

  const updateInvitationMetaMutation = useMutation({
    mutationFn: (params: {
      readonly invitationId: string;
      readonly deliveryStatus: 'not_shared' | 'shared';
      readonly expiresAt: string | null;
    }) =>
      updateOrganizerHouseholdInvitation({
        workspaceId,
        weddingId: wedding.id,
        invitationId: params.invitationId,
        deliveryStatus: params.deliveryStatus,
        expiresAt: params.expiresAt,
        ...(client !== undefined ? { client } : {}),
      }),
    onSuccess: async () => {
      setActionError(null);
      setActionFeedback('Updated household invitation settings.');
      await invalidateDirectory();
    },
    onError: (err) => {
      setActionError(translateGuestError(err).message);
    },
  });

  const filteredHouseholds = useMemo((): readonly HouseholdWithDetails[] => {
    const all = directoryQuery.data?.households ?? [];
    const normalizedQuery = deferredSearchTerm.trim().toLowerCase();
    if (!normalizedQuery) {
      return all;
    }

    return all.filter((entry) => {
      if (entry.group.display_name.toLowerCase().includes(normalizedQuery)) {
        return true;
      }
      return entry.guests.some((guest) =>
        `${guest.first_name} ${guest.last_name}`.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [directoryQuery.data?.households, deferredSearchTerm]);

  if (directoryQuery.isPending) {
    return (
      <Card data-testid="guests-directory-loading">
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          Loading household &amp; guest directory…
        </CardContent>
      </Card>
    );
  }

  if (directoryQuery.isError) {
    return (
      <Card role="alert" data-testid="guests-directory-error">
        <CardHeader>
          <CardTitle>Unable to Load Guest Directory</CardTitle>
          <CardDescription>{translateGuestError(directoryQuery.error).message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void directoryQuery.refetch()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const directory = directoryQuery.data;
  const referenceTimestampMs = directoryQuery.dataUpdatedAt;

  const handleExportDirectoryCsv = (): void => {
    const csv = buildGuestDirectoryCsv(directory, referenceTimestampMs);
    const filename = buildSafeCsvFilename(wedding.slug, 'guest-directory');
    downloadCsvFile(filename, csv);
    setActionError(null);
    setActionFeedback(`Exported ${filename} with formula-safe escaping.`);
  };

  return (
    <div className="space-y-6" data-testid="wedding-guest-directory-manager">
      {/* Metrics Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-xs font-medium">Households</p>
            <p data-testid="metric-total-households" className="mt-1 text-2xl font-semibold">
              {directory.totalHouseholds}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-xs font-medium">Named Guests</p>
            <p data-testid="metric-total-guests" className="mt-1 text-2xl font-semibold">
              {directory.totalGuests}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-xs font-medium">Max Attendance Cap</p>
            <p data-testid="metric-total-capacity" className="mt-1 text-2xl font-semibold">
              {directory.totalCapacity}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-xs font-medium">Active /i/… Links</p>
            <p data-testid="metric-active-links" className="mt-1 text-2xl font-semibold">
              {directory.activeLinksCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-xs font-medium">Marked Shared</p>
            <p data-testid="metric-shared-links" className="mt-1 text-2xl font-semibold">
              {directory.sharedLinksCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {!isWritable ? (
        <Card data-testid="guests-viewer-readonly-banner" className="bg-muted/30">
          <CardContent className="text-muted-foreground py-3 text-xs">
            You have <strong>Viewer</strong> access in this workspace. Household lists and link
            statuses are read-only; workspace owners, admins, and editors can add guests, import CSV
            files, or issue/revoke invitation links.
          </CardContent>
        </Card>
      ) : null}

      {wedding.status !== 'published' ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3 text-xs leading-relaxed">
            <strong>Note on Unpublished Projects:</strong> You can organize households and pre-issue
            invitation QR cards while in Draft, and personal <code>/i/:token</code> links will
            automatically unlock once you publish a website snapshot.
          </CardContent>
        </Card>
      ) : null}

      {actionFeedback ? (
        <div
          role="status"
          data-testid="guests-action-feedback"
          className="flex items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-500/5 px-3.5 py-2.5 text-xs font-medium"
        >
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
          <span>{actionFeedback}</span>
        </div>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          data-testid="guests-action-error"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-3.5 py-2.5 text-xs font-medium"
        >
          {actionError}
        </div>
      ) : null}

      {/* One-Time Issued / Rotated Token & Vector QR Card */}
      {oneTimeQrState ? (
        <IssuedInvitationQrCard
          householdName={oneTimeQrState.householdName}
          rawToken={oneTimeQrState.rawToken}
          expiresAt={oneTimeQrState.expiresAt}
          onDismiss={() => setOneTimeQrState(null)}
        />
      ) : null}

      {/* Action Toolbar */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Filter households or guest names…"
            aria-label="Filter households or guest names"
            data-testid="guests-search-input"
            className="pl-8"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={directory.totalHouseholds === 0}
            onClick={handleExportDirectoryCsv}
            data-testid="export-guest-directory-csv-button"
          >
            <Download className="size-4" aria-hidden="true" />
            Export Directory CSV
          </Button>
          {isWritable ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCsvImport((prev) => !prev);
                  setShowCreateHousehold(false);
                }}
                data-testid="toggle-csv-import-button"
              >
                <FileSpreadsheet className="size-4" aria-hidden="true" />
                Import CSV
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setShowCreateHousehold((prev) => !prev);
                  setShowCsvImport(false);
                }}
                data-testid="open-create-household-button"
              >
                <Plus className="size-4" aria-hidden="true" />
                New Household
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {isWritable && showCsvImport ? (
        <CsvGuestImportCard
          isImporting={csvImportMutation.isPending}
          serverError={
            csvImportMutation.isError ? translateGuestError(csvImportMutation.error).message : null
          }
          onImportHouseholds={async (households) => {
            await csvImportMutation.mutateAsync(households);
          }}
          onClose={() => setShowCsvImport(false)}
        />
      ) : null}

      {isWritable && showCreateHousehold ? (
        <HouseholdEditorPanel
          mode="create"
          isSubmitting={createGroupMutation.isPending}
          errorMessage={
            createGroupMutation.isError
              ? translateGuestError(createGroupMutation.error).message
              : null
          }
          onSubmitValues={async (values) => {
            await createGroupMutation.mutateAsync(values);
          }}
          onCancel={() => setShowCreateHousehold(false)}
        />
      ) : null}

      {/* Household Cards */}
      {filteredHouseholds.length === 0 ? (
        <Card data-testid="guests-empty-state">
          <CardContent className="py-12 text-center">
            <Users className="text-muted-foreground mx-auto mb-3 size-8" aria-hidden="true" />
            <p className="text-sm font-medium">
              {directory.totalHouseholds === 0
                ? 'No households added yet'
                : 'No households match your search filter'}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {directory.totalHouseholds === 0
                ? 'Create your first household group manually or bulk import a CSV spreadsheet.'
                : 'Try clearing the search query above.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredHouseholds.map(({ group, guests, activeInvitation, revokedCount }) => {
            const isEditingGroup = editingGroupId === group.id;
            const isConfirmingDelete = confirmDeleteGroupId === group.id;
            const isAddingGuest = addingGuestForGroupId === group.id;
            const isInvitationExpired =
              activeInvitation?.expires_at !== null &&
              activeInvitation?.expires_at !== undefined &&
              referenceTimestampMs > 0 &&
              Date.parse(activeInvitation.expires_at) <= referenceTimestampMs;

            const currentExpiryDraft =
              expiryDraftByGroupId[group.id] ??
              formatDateInputValue(activeInvitation?.expires_at ?? null);

            return (
              <Card key={group.id} data-testid={`household-card-${group.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-lg">{group.display_name}</CardTitle>
                        <Badge variant="secondary">
                          Up to {group.max_attendees}{' '}
                          {group.max_attendees === 1 ? 'attendee' : 'attendees'}
                        </Badge>
                        <Badge variant="outline">
                          {guests.length} {guests.length === 1 ? 'named member' : 'named members'}
                        </Badge>
                      </div>
                      {group.notes ? (
                        <CardDescription className="text-xs">
                          Organizer Note: {group.notes}
                        </CardDescription>
                      ) : null}
                    </div>

                    {isWritable ? (
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAddingGuestForGroupId(isAddingGuest ? null : group.id);
                            setEditingGroupId(null);
                          }}
                          data-testid={`add-guest-to-group-${group.id}`}
                        >
                          <UserPlus className="size-3.5" aria-hidden="true" />
                          Add Guest
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingGroupId(isEditingGroup ? null : group.id);
                            setAddingGuestForGroupId(null);
                          }}
                          data-testid={`edit-household-${group.id}`}
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                          Edit
                        </Button>
                        {isConfirmingDelete ? (
                          <>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={deleteGroupMutation.isPending}
                              onClick={() => deleteGroupMutation.mutate(group.id)}
                              data-testid={`confirm-delete-household-${group.id}`}
                            >
                              Confirm Delete
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDeleteGroupId(null)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteGroupId(group.id)}
                            data-testid={`delete-household-${group.id}`}
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            Delete
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {isWritable && isEditingGroup ? (
                    <HouseholdEditorPanel
                      mode="edit"
                      initialValues={{
                        displayName: group.display_name,
                        maxAttendees: group.max_attendees,
                        notes: group.notes,
                      }}
                      isSubmitting={updateGroupMutation.isPending}
                      errorMessage={
                        updateGroupMutation.isError
                          ? translateGuestError(updateGroupMutation.error).message
                          : null
                      }
                      onSubmitValues={async (values) => {
                        await updateGroupMutation.mutateAsync({ groupId: group.id, values });
                      }}
                      onCancel={() => setEditingGroupId(null)}
                    />
                  ) : null}

                  {isWritable && isAddingGuest ? (
                    <GuestMemberEditorPanel
                      mode="create"
                      householdName={group.display_name}
                      isSubmitting={createGuestMutation.isPending}
                      errorMessage={
                        createGuestMutation.isError
                          ? translateGuestError(createGuestMutation.error).message
                          : null
                      }
                      onSubmitValues={async (values) => {
                        await createGuestMutation.mutateAsync({
                          groupId: group.id,
                          values,
                          sortOrder: guests.length,
                        });
                      }}
                      onCancel={() => setAddingGuestForGroupId(null)}
                    />
                  ) : null}

                  {/* Household Members Table / List */}
                  <div className="space-y-2">
                    {guests.length === 0 ? (
                      <p className="text-muted-foreground text-xs italic">
                        No individual guests listed in this household yet.
                      </p>
                    ) : (
                      <ul className="divide-y rounded-lg border">
                        {guests.map((guest: GuestRow) => {
                          const isEditingThisGuest = editingGuestId === guest.id;
                          return (
                            <li
                              key={guest.id}
                              data-testid={`guest-row-${guest.id}`}
                              className="p-3 text-sm"
                            >
                              {isWritable && isEditingThisGuest ? (
                                <GuestMemberEditorPanel
                                  mode="edit"
                                  householdName={group.display_name}
                                  initialValues={{
                                    firstName: guest.first_name,
                                    lastName: guest.last_name,
                                    email: guest.email,
                                    phone: guest.phone,
                                    side: guest.side,
                                    isChild: guest.is_child,
                                    dietaryNotes: guest.dietary_notes,
                                  }}
                                  isSubmitting={updateGuestMutation.isPending}
                                  errorMessage={
                                    updateGuestMutation.isError
                                      ? translateGuestError(updateGuestMutation.error).message
                                      : null
                                  }
                                  onSubmitValues={async (values) => {
                                    await updateGuestMutation.mutateAsync({
                                      groupId: group.id,
                                      guestId: guest.id,
                                      values,
                                    });
                                  }}
                                  onCancel={() => setEditingGuestId(null)}
                                />
                              ) : (
                                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                                  <div className="space-y-0.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-medium">
                                        {guest.first_name} {guest.last_name}
                                      </span>
                                      <Badge variant="outline" className="text-[11px]">
                                        {GUEST_SIDE_LABELS[guest.side]}
                                      </Badge>
                                      {guest.is_child ? (
                                        <Badge variant="secondary" className="text-[11px]">
                                          Child
                                        </Badge>
                                      ) : null}
                                      {guest.dietary_notes ? (
                                        <Badge variant="outline" className="text-[11px]">
                                          Dietary: {guest.dietary_notes}
                                        </Badge>
                                      ) : null}
                                    </div>
                                    {guest.email || guest.phone ? (
                                      <p className="text-muted-foreground text-xs">
                                        {[guest.email, guest.phone].filter(Boolean).join(' · ')}
                                      </p>
                                    ) : null}
                                  </div>

                                  {isWritable ? (
                                    <div className="flex items-center gap-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setEditingGuestId(guest.id)}
                                        data-testid={`edit-guest-${guest.id}`}
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={deleteGuestMutation.isPending}
                                        onClick={() =>
                                          deleteGuestMutation.mutate({
                                            groupId: group.id,
                                            guestId: guest.id,
                                          })
                                        }
                                        data-testid={`delete-guest-${guest.id}`}
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Invitation Token & QR Lifecycle Bar */}
                  <div
                    data-testid={`invitation-controls-${group.id}`}
                    className="bg-muted/30 flex flex-col justify-between gap-3 rounded-lg border p-3 lg:flex-row lg:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-semibold">
                          <KeyRound className="text-primary size-3.5" aria-hidden="true" />
                          Household /i/… Access
                        </span>
                        {!activeInvitation ? (
                          <Badge variant="outline" data-testid={`inv-status-${group.id}`}>
                            No Active Link
                          </Badge>
                        ) : isInvitationExpired ? (
                          <Badge variant="destructive" data-testid={`inv-status-${group.id}`}>
                            Expired
                          </Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`inv-status-${group.id}`}>
                            Active SHA-256 Link
                          </Badge>
                        )}

                        {activeInvitation ? (
                          <Badge variant="outline">
                            {INVITATION_DELIVERY_LABELS[activeInvitation.delivery_status]}
                          </Badge>
                        ) : null}

                        {revokedCount > 0 ? (
                          <span className="text-muted-foreground text-[11px]">
                            ({revokedCount} prior revoked)
                          </span>
                        ) : null}
                      </div>

                      <p className="text-muted-foreground text-xs">
                        {!activeInvitation
                          ? 'Issue a personal 256-bit link and printable QR code for this household.'
                          : activeInvitation.expires_at
                            ? `Expires ${new Date(activeInvitation.expires_at).toLocaleDateString('en-US', { dateStyle: 'medium' })} (raw token stored as SHA-256 hash).`
                            : 'Active with no expiration date (raw token stored as SHA-256 hash).'}
                      </p>
                    </div>

                    {isWritable ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <label
                            htmlFor={`expiry-input-${group.id}`}
                            className="text-muted-foreground text-xs"
                          >
                            Expiry:
                          </label>
                          <Input
                            id={`expiry-input-${group.id}`}
                            data-testid={`inv-expiry-input-${group.id}`}
                            type="date"
                            value={currentExpiryDraft}
                            onChange={(event) =>
                              setExpiryDraftByGroupId((prev) => ({
                                ...prev,
                                [group.id]: event.target.value,
                              }))
                            }
                            className="h-8 w-36 text-xs"
                          />
                        </div>

                        {activeInvitation ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={updateInvitationMetaMutation.isPending}
                            onClick={() =>
                              updateInvitationMetaMutation.mutate({
                                invitationId: activeInvitation.id,
                                deliveryStatus:
                                  activeInvitation.delivery_status === 'shared'
                                    ? 'not_shared'
                                    : 'shared',
                                expiresAt: parseDateInputToFutureEndOfDayIso(currentExpiryDraft),
                              })
                            }
                            data-testid={`toggle-shared-${group.id}`}
                          >
                            {activeInvitation.delivery_status === 'shared'
                              ? 'Mark Unshared'
                              : 'Mark Shared'}
                          </Button>
                        ) : null}

                        <Button
                          type="button"
                          size="sm"
                          disabled={issueTokenMutation.isPending}
                          onClick={() =>
                            issueTokenMutation.mutate({
                              groupId: group.id,
                              householdName: group.display_name,
                              expiresAt: parseDateInputToFutureEndOfDayIso(currentExpiryDraft),
                            })
                          }
                          data-testid={`issue-invitation-${group.id}`}
                        >
                          <RotateCw className="size-3.5" aria-hidden="true" />
                          {activeInvitation ? 'Rotate Link & QR' : 'Issue Link & QR'}
                        </Button>

                        {activeInvitation ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={revokeTokenMutation.isPending}
                            onClick={() =>
                              revokeTokenMutation.mutate({
                                groupId: group.id,
                                invitationId: activeInvitation.id,
                              })
                            }
                            data-testid={`revoke-invitation-${group.id}`}
                          >
                            <ShieldBan className="size-3.5" aria-hidden="true" />
                            Revoke
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
