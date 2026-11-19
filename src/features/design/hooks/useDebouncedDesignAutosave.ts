import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  reorderWeddingSectionsDraft,
  updateWeddingSectionDraft,
  updateWeddingThemeDraft,
} from '@/features/design/api/designDraftApi';
import { translateDesignError } from '@/features/design/api/designErrors';
import { designQueryKeys } from '@/features/design/queryKeys';
import {
  type InvitationDocument,
  type InvitationSection,
  invitationSectionSchema,
  type WeddingThemeConfig,
  weddingThemeConfigSchema,
} from '@/features/design/schemas/designSchemas';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

export const DEFAULT_DESIGN_AUTOSAVE_DEBOUNCE_MS = 700;

export type BuilderAutosaveStatus =
  'saved' | 'dirty' | 'saving' | 'validation_error' | 'save_error';

export interface UseDebouncedDesignAutosaveParams {
  readonly userId: string;
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly canEdit: boolean;
  readonly initialDocument: InvitationDocument;
  readonly debounceMs?: number | undefined;
  readonly client?: TypedSupabaseClient | null | undefined;
}

export interface UseDebouncedDesignAutosaveResult {
  readonly draftDocument: InvitationDocument;
  readonly saveStatus: BuilderAutosaveStatus;
  readonly lastSavedAt: Date | null;
  readonly lastSaveError: string | null;
  readonly validationIssues: Readonly<Record<string, string>>;
  readonly hasUnsavedChanges: boolean;
  readonly queueThemeUpdate: (
    nextTheme: WeddingThemeConfig,
    options?: { readonly immediate?: boolean | undefined },
  ) => boolean;
  readonly queueSectionUpdate: (
    nextSection: InvitationSection,
    options?: { readonly immediate?: boolean | undefined },
  ) => boolean;
  readonly reorderSections: (orderedSectionIds: readonly string[]) => Promise<void>;
  readonly reportValidationIssue: (sourceKey: string, message: string | null) => void;
  readonly flushPendingSaves: () => Promise<void>;
}

export function useDebouncedDesignAutosave({
  userId,
  workspaceId,
  weddingId,
  canEdit,
  initialDocument,
  debounceMs = DEFAULT_DESIGN_AUTOSAVE_DEBOUNCE_MS,
  client,
}: UseDebouncedDesignAutosaveParams): UseDebouncedDesignAutosaveResult {
  const queryClient = useQueryClient();

  const [draftDocument, setDraftDocument] = useState<InvitationDocument>(() => initialDocument);
  const [saveStatus, setSaveStatus] = useState<BuilderAutosaveStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<Readonly<Record<string, string>>>({});

  const draftRef = useRef<InvitationDocument>(initialDocument);
  const validationIssuesRef = useRef<Record<string, string>>({});
  const pendingThemeRef = useRef<WeddingThemeConfig | null>(null);
  const pendingSectionsRef = useRef<Map<string, InvitationSection>>(new Map());
  const pendingReorderIdsRef = useRef<readonly string[] | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFlushingRef = useRef(false);
  const flushAgainImmediateRef = useRef(false);
  const unmountedRef = useRef(false);

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const hasQueuedMutations = useCallback((): boolean => {
    return (
      pendingThemeRef.current !== null ||
      pendingSectionsRef.current.size > 0 ||
      pendingReorderIdsRef.current !== null
    );
  }, []);

  const computeIdleStatus = useCallback(
    (currentError: string | null): BuilderAutosaveStatus => {
      if (currentError) {
        return 'save_error';
      }
      if (Object.keys(validationIssuesRef.current).length > 0) {
        return 'validation_error';
      }
      if (hasQueuedMutations()) {
        return 'dirty';
      }
      return 'saved';
    },
    [hasQueuedMutations],
  );

  const setIssueEntry = useCallback(
    (sourceKey: string, message: string | null) => {
      const next = { ...validationIssuesRef.current };
      if (message && message.trim().length > 0) {
        next[sourceKey] = message.trim();
      } else {
        delete next[sourceKey];
      }
      validationIssuesRef.current = next;
      if (!unmountedRef.current) {
        setValidationIssues(next);
        if (!isFlushingRef.current) {
          setSaveStatus((prev) => {
            if (Object.keys(next).length > 0) {
              return 'validation_error';
            }
            if (prev === 'validation_error') {
              return hasQueuedMutations() ? 'dirty' : 'saved';
            }
            return prev;
          });
        }
      }
    },
    [hasQueuedMutations],
  );

  const flushPendingSaves = useCallback(async (): Promise<void> => {
    if (!canEdit || unmountedRef.current) {
      return;
    }

    clearDebounceTimer();

    if (isFlushingRef.current) {
      flushAgainImmediateRef.current = true;
      return;
    }

    if (!hasQueuedMutations()) {
      setSaveStatus(computeIdleStatus(null));
      return;
    }

    isFlushingRef.current = true;
    if (!unmountedRef.current) {
      setSaveStatus('saving');
      setLastSaveError(null);
    }

    let encounteredError: string | null = null;

    try {
      do {
        flushAgainImmediateRef.current = false;

        const themeSnapshot = pendingThemeRef.current;
        pendingThemeRef.current = null;

        const reorderSnapshot = pendingReorderIdsRef.current;
        pendingReorderIdsRef.current = null;

        const sectionSnapshots = Array.from(pendingSectionsRef.current.values());
        pendingSectionsRef.current.clear();

        if (themeSnapshot) {
          try {
            await updateWeddingThemeDraft(
              {
                workspaceId,
                weddingId,
                presetId: themeSnapshot.presetId,
                tokenOverrides: themeSnapshot.tokenOverrides,
              },
              client,
            );
          } catch (err: unknown) {
            if (pendingThemeRef.current === null) {
              pendingThemeRef.current = themeSnapshot;
            }
            encounteredError = translateDesignError(err).message;
          }
        }

        if (!encounteredError && reorderSnapshot) {
          try {
            await reorderWeddingSectionsDraft(
              {
                workspaceId,
                weddingId,
                orderedSectionIds: reorderSnapshot,
              },
              client,
            );
          } catch (err: unknown) {
            if (pendingReorderIdsRef.current === null) {
              pendingReorderIdsRef.current = reorderSnapshot;
            }
            encounteredError = translateDesignError(err).message;
          }
        }

        for (const sec of sectionSnapshots) {
          try {
            await updateWeddingSectionDraft(
              {
                workspaceId,
                weddingId,
                section: sec,
              },
              client,
            );
          } catch (err: unknown) {
            if (!pendingSectionsRef.current.has(sec.id)) {
              pendingSectionsRef.current.set(sec.id, sec);
            }
            encounteredError = translateDesignError(err).message;
          }
        }

        if (encounteredError) {
          break;
        }
      } while (flushAgainImmediateRef.current && hasQueuedMutations() && !unmountedRef.current);
    } finally {
      isFlushingRef.current = false;
    }

    if (unmountedRef.current) {
      return;
    }

    if (encounteredError) {
      setLastSaveError(encounteredError);
      setSaveStatus('save_error');
      return;
    }

    queryClient.setQueryData<InvitationDocument | null>(
      designQueryKeys.draft(userId, workspaceId, weddingId),
      draftRef.current,
    );

    const savedInstant = new Date();
    setLastSavedAt(savedInstant);
    setLastSaveError(null);
    setSaveStatus(computeIdleStatus(null));
  }, [
    canEdit,
    clearDebounceTimer,
    client,
    computeIdleStatus,
    hasQueuedMutations,
    queryClient,
    userId,
    weddingId,
    workspaceId,
  ]);

  const scheduleDebouncedFlush = useCallback(
    (immediate = false) => {
      clearDebounceTimer();
      if (immediate) {
        void flushPendingSaves();
        return;
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void flushPendingSaves();
      }, debounceMs);
    },
    [clearDebounceTimer, debounceMs, flushPendingSaves],
  );

  const queueThemeUpdate = useCallback(
    (
      nextTheme: WeddingThemeConfig,
      options?: { readonly immediate?: boolean | undefined },
    ): boolean => {
      if (!canEdit) {
        return false;
      }

      const parsed = weddingThemeConfigSchema.safeParse(nextTheme);
      if (!parsed.success) {
        pendingThemeRef.current = null;
        setIssueEntry('theme', parsed.error.issues[0]?.message ?? 'Invalid theme configuration.');
        return false;
      }

      const updatedDoc: InvitationDocument = {
        ...draftRef.current,
        theme: parsed.data,
      };
      draftRef.current = updatedDoc;
      setDraftDocument(updatedDoc);
      setLastSaveError(null);
      setIssueEntry('theme', null);

      pendingThemeRef.current = parsed.data;
      if (!options?.immediate && !isFlushingRef.current) {
        setSaveStatus(
          Object.keys(validationIssuesRef.current).length > 0 ? 'validation_error' : 'dirty',
        );
      }
      scheduleDebouncedFlush(Boolean(options?.immediate));
      return true;
    },
    [canEdit, scheduleDebouncedFlush, setIssueEntry],
  );

  const queueSectionUpdate = useCallback(
    (
      nextSection: InvitationSection,
      options?: { readonly immediate?: boolean | undefined },
    ): boolean => {
      if (!canEdit) {
        return false;
      }

      const issueKey = `section:${nextSection.id}`;
      const parsed = invitationSectionSchema.safeParse(nextSection);
      if (!parsed.success) {
        pendingSectionsRef.current.delete(nextSection.id);
        setIssueEntry(
          issueKey,
          parsed.error.issues[0]?.message ?? 'Invalid section configuration.',
        );
        return false;
      }

      const nextSections = draftRef.current.sections.map((existing) =>
        existing.id === parsed.data.id
          ? { ...parsed.data, sortOrder: existing.sortOrder }
          : existing,
      );

      const syncedSection = nextSections.find((sec) => sec.id === parsed.data.id) ?? parsed.data;

      const updatedDoc: InvitationDocument = {
        ...draftRef.current,
        sections: nextSections,
      };
      draftRef.current = updatedDoc;
      setDraftDocument(updatedDoc);
      setLastSaveError(null);
      setIssueEntry(issueKey, null);

      pendingSectionsRef.current.set(syncedSection.id, syncedSection);
      if (!options?.immediate && !isFlushingRef.current) {
        setSaveStatus(
          Object.keys(validationIssuesRef.current).length > 0 ? 'validation_error' : 'dirty',
        );
      }
      scheduleDebouncedFlush(Boolean(options?.immediate));
      return true;
    },
    [canEdit, scheduleDebouncedFlush, setIssueEntry],
  );

  const reorderSections = useCallback(
    async (orderedSectionIds: readonly string[]): Promise<void> => {
      if (!canEdit) {
        return;
      }

      const sectionById = new Map(draftRef.current.sections.map((s) => [s.id, s]));
      if (
        orderedSectionIds.length !== sectionById.size ||
        new Set(orderedSectionIds).size !== sectionById.size ||
        orderedSectionIds.some((id) => !sectionById.has(id))
      ) {
        return;
      }

      const reorderedSections: InvitationSection[] = orderedSectionIds.map((id, idx) => {
        const current = sectionById.get(id)!;
        const updated = { ...current, sortOrder: idx };
        const pending = pendingSectionsRef.current.get(id);
        if (pending) {
          pendingSectionsRef.current.set(id, { ...pending, sortOrder: idx });
        }
        return updated;
      });

      const updatedDoc: InvitationDocument = {
        ...draftRef.current,
        sections: reorderedSections,
      };
      draftRef.current = updatedDoc;
      setDraftDocument(updatedDoc);
      setLastSaveError(null);

      pendingReorderIdsRef.current = [...orderedSectionIds];
      await flushPendingSaves();
    },
    [canEdit, flushPendingSaves],
  );

  const reportValidationIssue = useCallback(
    (sourceKey: string, message: string | null) => {
      if (!canEdit) {
        return;
      }
      if (message && sourceKey === 'theme') {
        pendingThemeRef.current = null;
      } else if (message && sourceKey.startsWith('section:')) {
        pendingSectionsRef.current.delete(sourceKey.slice('section:'.length));
      }
      setIssueEntry(sourceKey, message);
    },
    [canEdit, setIssueEntry],
  );

  const hasUnsavedChanges =
    saveStatus === 'dirty' ||
    saveStatus === 'saving' ||
    saveStatus === 'save_error' ||
    Object.keys(validationIssues).length > 0;

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      clearDebounceTimer();
    };
  }, [clearDebounceTimer]);

  return {
    draftDocument,
    saveStatus,
    lastSavedAt,
    lastSaveError,
    validationIssues,
    hasUnsavedChanges,
    queueThemeUpdate,
    queueSectionUpdate,
    reorderSections,
    reportValidationIssue,
    flushPendingSaves,
  };
}
