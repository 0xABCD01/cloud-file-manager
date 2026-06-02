/**
 * React Query hooks for folder operations.
 *
 * Provides queries and mutations for folder tree, creation, and deletion
 * with automatic cache invalidation.
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApi } from "@/lib/auth";
import type { FolderItem } from "@/types";

/** A folder tree node with nested children. */
export interface FolderTreeNode extends FolderItem {
  children: FolderTreeNode[];
}

/** Fetch the full folder tree for navigation / move-to dialogs. */
export function useFolderTree() {
  return useQuery<FolderTreeNode[]>({
    queryKey: ["folderTree"],
    queryFn: () => getApi().get<FolderTreeNode[]>("/api/v1/folders/tree"),
    staleTime: 60_000,
  });
}

/** Create a new folder. */
export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      parentId,
    }: {
      name: string;
      parentId: string | null;
    }) =>
      getApi().post<FolderItem>("/api/v1/folders", { name, parentId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["folderContents"] });
      void queryClient.invalidateQueries({ queryKey: ["folderTree"] });
    },
  });
}

/** Delete (soft-delete) a folder. */
export function useDeleteFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (folderId: string) =>
      getApi().del(`/api/v1/folders/${folderId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["folderContents"] });
      void queryClient.invalidateQueries({ queryKey: ["folderTree"] });
    },
  });
}
