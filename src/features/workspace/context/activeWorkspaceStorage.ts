const ACTIVE_WORKSPACE_STORAGE_PREFIX = 'wedding_platform:active_workspace:v1:';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getActiveWorkspaceStorageKey(userId: string): string {
  return `${ACTIVE_WORKSPACE_STORAGE_PREFIX}${userId}`;
}

export function readStoredActiveWorkspaceId(userId: string): string | null {
  try {
    const raw = window.localStorage.getItem(getActiveWorkspaceStorageKey(userId));
    if (!raw || !UUID_PATTERN.test(raw.trim())) {
      return null;
    }
    return raw.trim().toLowerCase();
  } catch {
    return null;
  }
}

export function writeStoredActiveWorkspaceId(userId: string, workspaceId: string): void {
  try {
    window.localStorage.setItem(getActiveWorkspaceStorageKey(userId), workspaceId.toLowerCase());
  } catch {
    // Ignore storage quota / private-mode restrictions; in-memory state remains authoritative.
  }
}

export function clearStoredActiveWorkspaceId(userId: string): void {
  try {
    window.localStorage.removeItem(getActiveWorkspaceStorageKey(userId));
  } catch {
    // Ignore storage restrictions.
  }
}
