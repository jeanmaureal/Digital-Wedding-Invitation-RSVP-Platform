import type { JSX } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { useActiveWorkspace } from '@/features/workspace/context/activeWorkspaceContext';
import { WORKSPACE_ROLE_LABELS } from '@/features/workspace/schemas/workspaceSchemas';

export function WorkspaceSwitcher(): JSX.Element | null {
  const { memberships, activeMembership, selectActiveWorkspace } = useActiveWorkspace();

  if (!activeMembership || memberships.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <NativeSelect
        aria-label="Active workspace"
        data-testid="workspace-switcher"
        value={activeMembership.workspace.id}
        onChange={(event) => selectActiveWorkspace(event.target.value)}
        className="h-8 max-w-[15rem] text-xs font-medium"
      >
        {memberships.map((entry) => (
          <option key={entry.workspace.id} value={entry.workspace.id}>
            {entry.workspace.name} ({WORKSPACE_ROLE_LABELS[entry.role]})
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
