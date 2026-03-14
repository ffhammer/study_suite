"use client";

import { useMemo, useState } from "react";
import { Upload, FileAudio, FileVideo, PlayCircle, Loader2, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { flattenFiles, formatBytes, WorkspaceFileItem } from "@/lib/file-tree";
import { useToast } from "@/hooks/use-toast";
import { FileExplorer } from "./file-explorer";

interface UploadDraft {
  id: string;
  file: File;
  folderPath: string;
  renamedFileName: string;
}

interface CourseOverviewProps {
  files: WorkspaceFileItem[];
  selectedCourse: string | null;
  onOpenFile?: (file: WorkspaceFileItem) => void;
  onRefreshFiles?: () => void;
}

const mediaExtensions = [".mp3", ".wav", ".m4a", ".mp4", ".mov", ".mkv", ".webm", ".avi"];

function isMedia(path?: string): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return mediaExtensions.some((ext) => lower.endsWith(ext));
}

export function CourseOverview({
  files,
  selectedCourse,
  onOpenFile,
  onRefreshFiles,
}: CourseOverviewProps) {
  const { toast } = useToast();
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<UploadDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [transcribeLoading, setTranscribeLoading] = useState<Record<string, boolean>>({});

  const flatFiles = useMemo(() => flattenFiles(files), [files]);

  const mediaFiles = useMemo(
    () => flatFiles.filter(({ file }) => file.type === "media" || isMedia(file.relativePath)),
    [flatFiles]
  );

  const addDraftFiles = (list: FileList | null) => {
    const incoming = Array.from(list || []);
    if (incoming.length === 0) return;

    const next = incoming.map((file, index) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${index}`,
      file,
      folderPath: "",
      renamedFileName: file.name,
    }));
    setDrafts((prev) => [...prev, ...next]);
  };

  const updateDraft = (id: string, patch: Partial<UploadDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const removeDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const uploadAll = async () => {
    if (!selectedCourse || drafts.length === 0) return;
    setUploading(true);

    try {
      for (const draft of drafts) {
        const folder = draft.folderPath.trim().replace(/^\/+|\/+$/g, "");
        const fileName = draft.renamedFileName.trim() || draft.file.name;
        const target = folder ? `${folder}/${fileName}` : fileName;
        await api.uploadFile(selectedCourse, draft.file, target);
      }

      setDrafts([]);
      toast({ title: "Upload complete", description: "All files uploaded." });
      onRefreshFiles?.();
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const startTranscribe = async (relativePath: string) => {
    if (!selectedCourse) return;
    setTranscribeLoading((prev) => ({ ...prev, [relativePath]: true }));

    try {
      await api.startTranscription(selectedCourse, relativePath);
      toast({
        title: "Transcription started",
        description: relativePath,
      });
      onRefreshFiles?.();
    } catch (error) {
      toast({
        title: "Could not start transcription",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    } finally {
      setTranscribeLoading((prev) => ({ ...prev, [relativePath]: false }));
    }
  };

  return (
    <div className="h-full grid grid-cols-12 gap-0">
      <div className="col-span-4 border-r border-border min-h-0">
        <FileExplorer
          files={files}
          selectedFileId={selectedFileId}
          onFileSelect={(file) => {
            setSelectedFileId(file.id);
            onOpenFile?.(file);
          }}
          onRefresh={onRefreshFiles}
        />
      </div>

      <div className="col-span-8 min-h-0 flex flex-col">
        <div className="h-10 border-b border-border px-4 flex items-center justify-between bg-card">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FolderTree className="h-4 w-4" />
            Course Overview
          </div>
          <Button variant="secondary" size="sm" onClick={onRefreshFiles}>
            Refresh
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Upload Files</h3>
              <div className="rounded-md border border-border p-3 space-y-3">
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Upload className="h-4 w-4" />
                  Select one or more files
                </label>
                <Input type="file" multiple onChange={(e) => addDraftFiles(e.target.files)} />

                {drafts.length > 0 && (
                  <div className="space-y-2">
                    {drafts.map((draft) => (
                      <div key={draft.id} className="grid grid-cols-12 gap-2 items-center rounded border border-border p-2">
                        <div className="col-span-4 text-xs truncate" title={draft.file.name}>
                          {draft.file.name}
                        </div>
                        <Input
                          className="col-span-3 h-8 text-xs"
                          placeholder="Folder (e.g. Lectures/Week1)"
                          value={draft.folderPath}
                          onChange={(e) => updateDraft(draft.id, { folderPath: e.target.value })}
                        />
                        <Input
                          className="col-span-4 h-8 text-xs"
                          placeholder="Rename file"
                          value={draft.renamedFileName}
                          onChange={(e) => updateDraft(draft.id, { renamedFileName: e.target.value })}
                        />
                        <Button
                          className="col-span-1 h-8"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDraft(draft.id)}
                        >
                          x
                        </Button>
                      </div>
                    ))}
                    <Button onClick={() => uploadAll().catch(() => undefined)} disabled={uploading}>
                      {uploading ? "Uploading..." : `Upload ${drafts.length} file(s)`}
                    </Button>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Media & Transcription</h3>
              <div className="rounded-md border border-border overflow-hidden">
                <div className="grid grid-cols-12 text-xs uppercase tracking-wider text-muted-foreground bg-muted/40 px-3 py-2">
                  <div className="col-span-6">File</div>
                  <div className="col-span-2">Size</div>
                  <div className="col-span-2">Transcript</div>
                  <div className="col-span-2">Action</div>
                </div>
                <div className="max-h-64 overflow-auto">
                  {mediaFiles.length === 0 && (
                    <div className="px-3 py-4 text-sm text-muted-foreground">No audio/video files found.</div>
                  )}
                  {mediaFiles.map(({ file }) => {
                    const rel = file.relativePath || file.name;
                    const hasTranscript = Boolean(file.transcriptText && file.transcriptText.trim().length > 0);
                    const loading = Boolean(transcribeLoading[rel]);
                    return (
                      <div key={file.id} className="grid grid-cols-12 px-3 py-2 border-t border-border items-center text-sm">
                        <div className="col-span-6 flex items-center gap-2 truncate" title={rel}>
                          {rel.toLowerCase().endsWith(".mp3") || rel.toLowerCase().endsWith(".wav") || rel.toLowerCase().endsWith(".m4a") ? (
                            <FileAudio className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <FileVideo className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="truncate">{rel}</span>
                        </div>
                        <div className="col-span-2 text-xs text-muted-foreground">{formatBytes(file.size)}</div>
                        <div className="col-span-2 text-xs">
                          {hasTranscript ? (
                            <span className="text-green-500">Transcribed</span>
                          ) : (
                            <span className="text-amber-500">Not yet</span>
                          )}
                        </div>
                        <div className="col-span-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => startTranscribe(rel).catch(() => undefined)}
                            disabled={loading}
                          >
                            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
