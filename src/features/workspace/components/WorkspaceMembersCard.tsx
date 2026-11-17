import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeOff, UserPlus, UserX } from 'lucide-react';
import { type JSX, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import {
  addOrganizerWorkspaceMember,
  changeOrganizerWorkspaceMemberRole,
  fetchWorkspaceMemberDirectory,
  type OrganizerWorkspaceMembership,
  removeOrganizerWorkspaceMember,
  type WorkspaceMemberDirectoryEntry,
} from '@/features/workspace/api/workspaceApi';
import { translateWorkspaceError } from '@/features/workspace/api/workspaceErrors';
import {
  canAddWorkspaceMembers,
  canChangeMemberRole,
  canRemoveWorkspaceMember,
  canViewAllMemberEmails,
  getAssignableMemberRoles,
} from '@/features/workspace/permissions/workspacePermissions';
import { workspaceQueryKeys } from '@/features/workspace/queryKeys';
import {
  type AddWorkspaceMemberFormValues,
  type AddWorkspaceMemberPayload,
  addWorkspaceMemberSchema,
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from '@/features/workspace/schemas/workspaceSchemas';

export interface WorkspaceMembersCardProps {
  readonly activeMembership: OrganizerWorkspaceMembership;
  readonly onOwnerCountResolved?: ((ownerCount: number) => void) | undefined;
}

const EMPTY_DIRECTORY: readonly WorkspaceMemberDirectoryEntry[] = [];

export function WorkspaceMembersCard({
  activeMembership,
  onOwnerCountResolved,
}: WorkspaceMembersCardProps): JSX.Element {
  const { user } = useOrganizerAuth();
  const queryClient = useQueryClient();
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccessMessage, setAddSuccessMessage] = useState<string | null>(null);
  const [rowMutationError, setRowMutationError] = useState<string | null>(null);
  const [mutatingMemberId, setMutatingMemberId] = useState<string | null>(null);

  const userId = user?.id ?? '';
  const workspaceId = activeMembership.workspace.id;
  const callerRole = activeMembership.role;
  const assignableRoles = getAssignableMemberRoles(callerRole);
  const canAdd = canAddWorkspaceMembers(callerRole);
  const seesCoMemberEmails = canViewAllMemberEmails(callerRole);

  const directoryQuery = useQuery({
    queryKey: workspaceQueryKeys.memberDirectory(userId, workspaceId),
    queryFn: () => fetchWorkspaceMemberDirectory(workspaceId),
    enabled: Boolean(userId && workspaceId),
  });

  const members = directoryQuery.data ?? EMPTY_DIRECTORY;
  const ownerCount = members.filter((entry) => entry.role === 'owner').length;

  useEffect(() => {
    if (directoryQuery.isSuccess) {
      onOwnerCountResolved?.(ownerCount);
    }
  }, [directoryQuery.isSuccess, onOwnerCountResolved, ownerCount]);

  const defaultInviteRole: WorkspaceRole = assignableRoles.includes('editor')
    ? 'editor'
    : (assignableRoles[0] ?? 'viewer');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddWorkspaceMemberFormValues, unknown, AddWorkspaceMemberPayload>({
    resolver: zodResolver(addWorkspaceMemberSchema),
    defaultValues: {
      email: '',
      role: defaultInviteRole,
    },
  });

  const invalidateWorkspaceData = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.memberDirectory(userId, workspaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.memberships(userId),
      }),
    ]);
  };

  const onAddMemberSubmit = async (values: AddWorkspaceMemberPayload): Promise<void> => {
    setAddError(null);
    setAddSuccessMessage(null);
    try {
      await addOrganizerWorkspaceMember({
        workspaceId,
        email: values.email,
        role: values.role,
      });
      await invalidateWorkspaceData();
      reset({ email: '', role: defaultInviteRole });
      setAddSuccessMessage(`Added ${values.email} as ${WORKSPACE_ROLE_LABELS[values.role]}.`);
    } catch (error: unknown) {
      setAddError(translateWorkspaceError(error).message);
    }
  };

  const onChangeRole = async (member: WorkspaceMemberDirectoryEntry, newRole: WorkspaceRole) => {
    if (newRole === member.role) {
      return;
    }
    setRowMutationError(null);
    setMutatingMemberId(member.memberId);
    try {
      await changeOrganizerWorkspaceMemberRole({
        workspaceId,
        memberUserId: member.userId,
        newRole,
      });
      await invalidateWorkspaceData();
    } catch (error: unknown) {
      setRowMutationError(translateWorkspaceError(error).message);
    } finally {
      setMutatingMemberId(null);
    }
  };

  const onRemoveMember = async (member: WorkspaceMemberDirectoryEntry) => {
    setRowMutationError(null);
    setMutatingMemberId(member.memberId);
    try {
      await removeOrganizerWorkspaceMember({
        workspaceId,
        memberUserId: member.userId,
      });
      await invalidateWorkspaceData();
    } catch (error: unknown) {
      setRowMutationError(translateWorkspaceError(error).message);
    } finally {
      setMutatingMemberId(null);
    }
  };

  return (
    <Card data-testid="workspace-members-card">
      <CardHeader>
        <CardTitle>Team Members &amp; Roles</CardTitle>
        <CardDescription>
          {seesCoMemberEmails
            ? 'Manage existing registered organizers in this workspace. Co-member email addresses are visible to Owners and Admins (`P1-AC15`).'
            : 'View workspace team members. For privacy, co-member email addresses are visible only to Workspace Owners and Admins (`P1-AC15`).'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {canAdd ? (
          <div className="bg-muted/40 space-y-3 rounded-lg border p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserPlus className="text-primary size-4" aria-hidden="true" />
                <span>Add Existing Organizer</span>
              </div>
              <p className="text-muted-foreground text-xs">
                Adds an organizer who has already registered an account. Pending email invitations
                for unregistered organizers are deferred to a future phase.
              </p>
            </div>

            {addError ? (
              <div
                role="alert"
                data-testid="add-member-error"
                className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
              >
                {addError}
              </div>
            ) : null}

            {addSuccessMessage ? (
              <p
                role="status"
                data-testid="add-member-success"
                className="text-primary text-xs font-medium"
              >
                {addSuccessMessage}
              </p>
            ) : null}

            <form
              onSubmit={(event) => void handleSubmit(onAddMemberSubmit)(event)}
              noValidate
              className="grid gap-3 sm:grid-cols-[1fr_11rem_auto] sm:items-start"
            >
              <div className="space-y-1.5">
                <Label htmlFor="add-member-email">Organizer email</Label>
                <Input
                  id="add-member-email"
                  type="email"
                  placeholder="co-organizer@studio.com"
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'add-member-email-error' : undefined}
                  {...register('email')}
                />
                <FormFieldError id="add-member-email-error" message={errors.email?.message} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-member-role">Assigned role</Label>
                <NativeSelect
                  id="add-member-role"
                  disabled={isSubmitting}
                  data-testid="add-member-role-select"
                  {...register('role')}
                >
                  {assignableRoles.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>
                      {WORKSPACE_ROLE_LABELS[roleOption]}
                    </option>
                  ))}
                </NativeSelect>
                <FormFieldError id="add-member-role-error" message={errors.role?.message} />
              </div>

              <div className="sm:pt-[1.375rem]">
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  disabled={isSubmitting}
                  data-testid="add-member-submit-button"
                >
                  {isSubmitting ? 'Adding…' : 'Add member'}
                </Button>
              </div>
            </form>
          </div>
        ) : null}

        {rowMutationError ? (
          <div
            role="alert"
            data-testid="member-row-error"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
          >
            {rowMutationError}
          </div>
        ) : null}

        {directoryQuery.isPending ? (
          <p className="text-muted-foreground text-sm">Loading workspace members…</p>
        ) : directoryQuery.isError ? (
          <div
            role="alert"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3.5 text-sm"
          >
            {translateWorkspaceError(directoryQuery.error).message}
          </div>
        ) : (
          <ul
            data-testid="workspace-member-list"
            className="divide-border divide-y rounded-lg border"
          >
            {members.map((member) => {
              const isSelf = member.userId === userId;
              const isMutatingThisRow = mutatingMemberId === member.memberId;
              const canEditRole = canChangeMemberRole({
                callerRole,
                callerUserId: userId,
                targetRole: member.role,
                targetUserId: member.userId,
                ownerCount,
              });
              const canRemoveOther =
                !isSelf &&
                canRemoveWorkspaceMember({
                  callerRole,
                  callerUserId: userId,
                  targetRole: member.role,
                  targetUserId: member.userId,
                  ownerCount,
                });

              const displayName = member.fullName.trim() || 'Organizer';

              return (
                <li
                  key={member.memberId}
                  data-testid={`member-row-${member.userId}`}
                  className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{displayName}</span>
                      {isSelf ? <Badge variant="outline">You</Badge> : null}
                      <Badge variant="secondary">{WORKSPACE_ROLE_LABELS[member.role]}</Badge>
                    </div>

                    {member.email !== null ? (
                      <p
                        data-testid="member-email-visible"
                        className="text-muted-foreground truncate text-xs"
                      >
                        {member.email}
                      </p>
                    ) : (
                      <p
                        data-testid="member-email-masked"
                        className="text-muted-foreground inline-flex items-center gap-1 text-xs italic"
                      >
                        <EyeOff className="size-3.5" aria-hidden="true" />
                        Email hidden for your role
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {canEditRole ? (
                      <NativeSelect
                        aria-label={`Role for ${displayName}`}
                        data-testid={`member-role-select-${member.userId}`}
                        value={member.role}
                        disabled={isMutatingThisRow}
                        onChange={(event) =>
                          void onChangeRole(member, event.target.value as WorkspaceRole)
                        }
                        className="h-8 w-32 text-xs"
                      >
                        {assignableRoles.map((roleOption) => (
                          <option key={roleOption} value={roleOption}>
                            {WORKSPACE_ROLE_LABELS[roleOption]}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : member.role === 'owner' && ownerCount <= 1 && callerRole === 'owner' ? (
                      <span
                        data-testid="sole-owner-badge"
                        className="text-muted-foreground text-xs"
                      >
                        Sole owner
                      </span>
                    ) : null}

                    {canRemoveOther ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isMutatingThisRow}
                        onClick={() => void onRemoveMember(member)}
                        data-testid={`member-remove-button-${member.userId}`}
                      >
                        <UserX className="size-3.5" aria-hidden="true" />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
