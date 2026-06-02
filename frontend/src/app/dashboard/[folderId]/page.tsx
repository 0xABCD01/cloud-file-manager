/**
 * Subfolder page — shows the contents of a specific folder.
 */

import { FileBrowser } from "@/components/file-browser";
import type { BreadcrumbItem } from "@/types";

interface FolderPageProps {
  params: Promise<{ folderId: string }>;
}

export default async function FolderPage({ params }: FolderPageProps) {
  const { folderId } = await params;

  // In a real app, breadcrumbs would be fetched from the API based on the
  // folder's ancestry. For now we use the folderId as a placeholder.
  const breadcrumbs: BreadcrumbItem[] = [
    { id: folderId, name: "Folder" },
  ];

  return <FileBrowser folderId={folderId} breadcrumbs={breadcrumbs} />;
}
