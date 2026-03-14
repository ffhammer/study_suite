import { ResourceMeta } from "@/lib/api";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export type WorkspaceFileType =
  | "folder"
  | "file"
  | "media"
  | "image"
  | "pdf"
  | "binary";

export interface WorkspaceFileItem {
  id: string;
  name: string;
  type: WorkspaceFileType;
  children?: WorkspaceFileItem[];
  relativePath?: string;
  size?: number;
  lastProcessed?: string | null;
  transcriptText?: string | null;
  transcriptSegments?: TranscriptSegment[] | null;
}

const mediaExtensions = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
  ".mp4",
  ".mov",
  ".mkv",
  ".webm",
  ".avi",
]);

const imageExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
]);

const textExtensions = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".csv",
  ".tsv",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".go",
  ".rs",
  ".sh",
  ".sql",
  ".xml",
  ".log",
  ".ipynb",
]);

function detectFileType(fileName: string): WorkspaceFileType {
  const dotIndex = fileName.lastIndexOf(".");
  const ext = dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
  if (imageExtensions.has(ext)) return "image";
  if (mediaExtensions.has(ext)) return "media";
  if (ext === ".pdf") return "pdf";
  if (textExtensions.has(ext) || ext === "") return "file";
  return "binary";
}

function makeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_./-]/g, "_");
}

export function buildTree(resources: ResourceMeta[]): WorkspaceFileItem[] {
  const roots: WorkspaceFileItem[] = [];
  const folders = new Map<string, WorkspaceFileItem>();

  const getOrCreateFolder = (pathParts: string[]): WorkspaceFileItem | null => {
    if (pathParts.length === 0) return null;

    const key = pathParts.join("/");
    const existing = folders.get(key);
    if (existing) return existing;

    const folder: WorkspaceFileItem = {
      id: makeId(`folder:${key}`),
      name: pathParts[pathParts.length - 1],
      type: "folder",
      relativePath: key,
      children: [],
    };
    folders.set(key, folder);

    if (pathParts.length === 1) {
      roots.push(folder);
    } else {
      const parent = getOrCreateFolder(pathParts.slice(0, -1));
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(folder);
      }
    }

    return folder;
  };

  for (const item of resources) {
    const normalized = item.relative_path.replace(/^\/+/, "");
    const isFolderEntry = normalized.endsWith("/");
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    if (isFolderEntry) {
      getOrCreateFolder(parts);
      continue;
    }

    const fileName = parts[parts.length - 1];
    const parentParts = parts.slice(0, -1);

    const fileNode: WorkspaceFileItem = {
      id: makeId(`file:${normalized}`),
      name: fileName,
      type: detectFileType(fileName),
      relativePath: normalized,
      size: item.size ?? undefined,
      lastProcessed: item.last_processed ?? null,
      transcriptText: item.transcript_text ?? null,
      transcriptSegments: item.transcript_segments ?? null,
    };

    if (parentParts.length === 0) {
      roots.push(fileNode);
    } else {
      const parent = getOrCreateFolder(parentParts);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(fileNode);
      }
    }
  }

  const sortNodes = (nodes: WorkspaceFileItem[]) => {
    nodes.sort((a, b) => {
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;
      return a.name.localeCompare(b.name);
    });

    for (const node of nodes) {
      if (node.children?.length) {
        sortNodes(node.children);
      }
    }
  };

  sortNodes(roots);
  return roots;
}

export function flattenFiles(
  files: WorkspaceFileItem[],
  path = ""
): Array<{ file: WorkspaceFileItem; path: string }> {
  const result: Array<{ file: WorkspaceFileItem; path: string }> = [];

  for (const file of files) {
    const currentPath = path ? `${path}/${file.name}` : file.name;

    if (file.type === "folder" && file.children) {
      result.push(...flattenFiles(file.children, currentPath));
    } else if (file.type !== "folder") {
      result.push({ file, path: currentPath });
    }
  }

  return result;
}

export function formatBytes(size?: number): string {
  if (!size || size <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[index]}`;
}
