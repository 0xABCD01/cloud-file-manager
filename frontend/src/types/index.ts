// CloudVault TypeScript types

export interface User {
  id: string;
  email: string;
  display_name: string;
  storage_quota_bytes: number;
  storage_used_bytes: number;
  is_verified: boolean;
  created_at: string;
}

export interface FileItem {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  folder_id: string | null;
  owner_id: string;
  checksum_sha256: string;
  version: number;
  is_trashed: boolean;
  created_at: string;
  updated_at: string;
}

export interface FolderItem {
  id: string;
  name: string;
  owner_id: string;
  parent_id: string | null;
  is_trashed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShareLink {
  id: string;
  token: string;
  resource_type: "file" | "folder";
  resource_id: string;
  permission: "view" | "edit";
  expires_at: string | null;
  is_active: boolean;
  access_count: number;
  created_at: string;
  url?: string;
}

export interface Permission {
  id: string;
  resource_type: "file" | "folder";
  resource_id: string;
  user_id: string;
  user_email: string;
  user_display_name: string;
  permission: "view" | "edit" | "admin";
  granted_by: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export interface FolderContents {
  folders: FolderItem[];
  files: (FileItem & { type: "file" })[];
  total_items: number;
}

export interface FolderTreeNode {
  id: string;
  name: string;
  children: FolderTreeNode[];
}
