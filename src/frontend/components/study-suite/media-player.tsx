"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileAudio, FileVideo, Search, EyeOff, Eye, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceFileItem } from "@/lib/file-tree";

interface MediaPlayerProps {
  file: WorkspaceFileItem;
  sourceUrl: string;
  courseName: string;
  onSaveTranscript?: (text: string) => Promise<void>;
}

function isAudioFile(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".mp3") ||
    lower.endsWith(".wav") ||
    lower.endsWith(".m4a") ||
    lower.endsWith(".aac") ||
    lower.endsWith(".ogg") ||
    lower.endsWith(".flac")
  );
}

export function MediaPlayer({ file, sourceUrl, onSaveTranscript }: MediaPlayerProps) {
  const isAudio = useMemo(() => isAudioFile(file.name), [file.name]);
  const [transcriptOnly, setTranscriptOnly] = useState(isAudio);
  const [transcriptText, setTranscriptText] = useState(file.transcriptText || "");
  const [findQuery, setFindQuery] = useState("");
  const [findResult, setFindResult] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTranscriptText(file.transcriptText || "");
    setTranscriptOnly(isAudioFile(file.name));
    setFindQuery("");
    setFindResult("");
  }, [file.id, file.name, file.transcriptText]);

  const handleFindNext = () => {
    const query = findQuery.trim();
    if (!query) {
      setFindResult("");
      return;
    }

    const text = transcriptText;
    const area = textareaRef.current;
    const startFrom = area ? area.selectionEnd : 0;

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    let index = lowerText.indexOf(lowerQuery, startFrom);
    if (index === -1) {
      index = lowerText.indexOf(lowerQuery, 0);
    }

    if (index === -1) {
      setFindResult("No match");
      return;
    }

    if (area) {
      area.focus();
      area.setSelectionRange(index, index + query.length);
    }

    setFindResult(`Match at ${index + 1}`);
  };

  const handleSave = async () => {
    if (!onSaveTranscript) return;
    setIsSaving(true);
    try {
      await onSaveTranscript(transcriptText);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (!isMod || event.key.toLowerCase() !== "s") return;

      const active = document.activeElement;
      const withinTranscript =
        !!active &&
        !!containerRef.current &&
        containerRef.current.contains(active) &&
        active === textareaRef.current;

      if (!withinTranscript) return;

      event.preventDefault();
      handleSave().catch(() => undefined);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [transcriptText, onSaveTranscript]);

  return (
    <div ref={containerRef} className="h-full flex flex-col min-h-0">
      {!transcriptOnly && (
        <div
          className={
            isAudio
              ? "bg-black shrink-0 border-b border-border p-4"
              : "bg-black shrink-0 border-b border-border h-[42vh] min-h-[240px] max-h-[60vh]"
          }
        >
          {isAudio ? (
            <div className="w-full flex flex-col items-center justify-center gap-3">
              <div className="flex items-center gap-2 text-white/80 text-sm">
                <FileAudio className="h-4 w-4" />
                <span className="truncate max-w-full">{file.name}</span>
              </div>
              <audio controls className="w-full" src={sourceUrl} preload="metadata" />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <div className="flex items-center gap-2 text-white/80 text-sm">
                <FileVideo className="h-4 w-4" />
                <span className="truncate max-w-full">{file.name}</span>
              </div>
              <video controls className="h-full w-full" src={sourceUrl} preload="metadata" />
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col bg-card">
        <div className="border-b border-border px-3 py-2 shrink-0 flex items-center justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Transcript Editor
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setTranscriptOnly((prev) => !prev)}
            >
              {transcriptOnly ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {transcriptOnly ? "Show Media" : "Transcript Only"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => handleSave().catch(() => undefined)}
              disabled={isSaving}
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="border-b border-border px-3 py-2 shrink-0 flex items-center gap-2">
          <div className="relative w-full">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
            <Input
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              placeholder="Find in transcript"
              className="h-8 text-xs pl-7"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleFindNext();
                }
              }}
            />
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleFindNext}>
            Next
          </Button>
          {findResult && <span className="text-[11px] text-muted-foreground whitespace-nowrap">{findResult}</span>}
        </div>

        <div className="flex-1 min-h-0 p-3">
          <Textarea
            ref={textareaRef}
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            placeholder="Transcript will appear here after transcription."
            className="h-full w-full resize-none text-sm leading-relaxed overflow-auto"
          />
        </div>
      </div>
    </div>
  );
}
