import { z } from 'zod';
import { emailFieldSchema } from '@/features/auth/schemas/authSchemas';
import type { Database } from '@/types/database.types';

export const WORKSPACE_ROLES = [
  'owner',
  'admin',
  'editor',
  'viewer',
] as const satisfies readonly Database['public']['Enums']['workspace_role'][];

export type WorkspaceRole = Database['public']['Enums']['workspace_role'];

export const WORKSPACE_ROLE_LABELS: Readonly<Record<WorkspaceRole, string>> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(2, 'Workspace name must be at least 2 characters.')
  .max(80, 'Workspace name must be 80 characters or fewer.');

export const workspaceSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Workspace slug must be at least 2 characters.')
  .max(63, 'Workspace slug must be 63 characters or fewer.')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers, and single hyphens only (for example, morgan-events).',
  );

export const createWorkspaceSchema = z.object({
  name: workspaceNameSchema,
  slug: z
    .string()
    .trim()
    .transform((raw) => (raw === '' ? undefined : raw.toLowerCase()))
    .pipe(workspaceSlugSchema.optional()),
});

export type CreateWorkspaceFormValues = z.input<typeof createWorkspaceSchema>;
export type CreateWorkspacePayload = z.output<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  name: workspaceNameSchema,
  slug: workspaceSlugSchema,
});

export type UpdateWorkspaceFormValues = z.input<typeof updateWorkspaceSchema>;
export type UpdateWorkspacePayload = z.output<typeof updateWorkspaceSchema>;

export const profileFullNameSchema = z.object({
  fullName: z.string().trim().max(120, 'Full name must be 120 characters or fewer.'),
});

export type ProfileFullNameFormValues = z.input<typeof profileFullNameSchema>;
export type ProfileFullNamePayload = z.output<typeof profileFullNameSchema>;

export const addWorkspaceMemberSchema = z.object({
  email: emailFieldSchema,
  role: z.enum(WORKSPACE_ROLES),
});

export type AddWorkspaceMemberFormValues = z.input<typeof addWorkspaceMemberSchema>;
export type AddWorkspaceMemberPayload = z.output<typeof addWorkspaceMemberSchema>;
