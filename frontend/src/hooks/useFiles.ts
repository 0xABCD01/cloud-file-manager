/**
 * React Query hooks for file operations.
 *
 * Provides mutations for upload, delete, rename, and move with
 * automatic cache invalidation on success.
 */

"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { getApi } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import type { FileItem, ContentItem } from "@/types";

/** Invalidate folder contents queries after a mutation. */
function invalidateFolderQueries(
  queryClient: QueryClient,
  folderId?: string | null,
) {
  void queryClient.invalidateQueries({ queryKey: ["folderContents"] });
  if (folderId !== undefined) {
    void queryClient.invalidateQueries({
      queryKey: ["folderContents", folderId],
    });
  }
}

/** Fetch contents of a folder (null = root). */
export function useFolderContents(folderId: string | null) {
  return useQuery<ContentItem[]>({
    queryKey: ["folderContents", folderId],
    queryFn: () => {
      return getApi().get<ContentItem[]>(
        `/api/v1/folders/${folderId ?? "root"}/contents`,
      );
    },
    staleTime: 30_000,
  });
}

/** Upload a file with progress tracking. */
export function useUploadFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      folderId,
      onProgress,
      signal,
    }: {
      file: File;
      folderId?: string;
      onProgress?: (pct: number) => void;
      signal?: AbortSignal;
    }) => getApi().upload<FileItem>("/api/v1/files/upload", file, folderId, onProgress, signal),
    onSuccess: (_data, variables) => {
      invalidateFolderQueries(queryClient, variables.folderId ?? null);
    },
  });
}

/** Delete (soft-delete) a file. */
export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) =>
      getApi().del(`/api/v1/files/${fileId}`),
    onSuccess: () => {
      invalidateFolderQueries(queryClient);
    },
  });
}

/** Rename a file. */
export function useRenameFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fileId, name }: { fileId: string; name: string }) =>
      getApi().patch<FileItem>(`/api/v1/files/${fileId}`, { name }),
    onSuccess: () => {
      invalidateFolderQueries(queryClient);
    },
  });
}

/** Move a file to a different folder. */
export function useMoveFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      fileId,
      targetFolderId,
    }: {
      fileId: string;
      targetFolderId: string | null;
    }) =>
      getApi().patch<FileItem>(`/api/v1/files/${fileId}/move`, {
        folderId: targetFolderId,
      }),
    onSuccess: () => {
      invalidateFolderQueries(queryClient);
    },
  });
}
