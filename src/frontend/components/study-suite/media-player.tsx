"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileAudio, EyeOff, Eye, Save, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
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

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function MediaPlayer({ file, sourceUrl, onSaveTranscript }: MediaPlayerProps) {
  const isAudio = useMemo(() => isAudioFile(file.name), [file.name]);
  const mediaRef = useRef<HTMLMediaElement>(null);
  const segmentRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [transcriptOnly, setTranscriptOnly] = useState(isAudio);
  const [transcriptText, setTranscriptText] = useState(file.transcriptText || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const transcriptSegments = useMemo(() => {
    const input = file.transcriptSegments || [];
    return input
      .filter(
        (segment): segment is { start: number; end: number; text: string } =>
          Number.isFinite(segment?.start) &&
          Number.isFinite(segment?.end) &&
          typeof segment?.text === "string"
      )
      .sort((a, b) => a.start - b.start);
  }, [file.transcriptSegments]);

  useEffect(() => {
    setTranscriptText(file.transcriptText || "");
    setTranscriptOnly(isAudioFile(file.name));
    setIsEditingTranscript(false);
    setCurrentTime(0);
    setActiveSegmentIndex(-1);
    segmentRefs.current = [];
  }, [file.id, file.name, file.transcriptText]);

  useEffect(() => {
    if (transcriptSegments.length === 0) {
      setActiveSegmentIndex(-1);
      return;
    }

    const index = transcriptSegments.findIndex(
      (segment) => currentTime >= segment.start && currentTime < segment.end
    );

    if (index === -1) {
      if (currentTime < transcriptSegments[0].start) {
        setActiveSegmentIndex(0);
        return;
      }

      if (currentTime >= transcriptSegments[transcriptSegments.length - 1].end) {
        setActiveSegmentIndex(transcriptSegments.length - 1);
        return;
      }
    }

    setActiveSegmentIndex(index);
  }, [currentTime, transcriptSegments]);

  useEffect(() => {
    if (activeSegmentIndex < 0) return;
    const node = segmentRefs.current[activeSegmentIndex];
    if (!node) return;
    node.scrollIntoView({ block: "nearest" });
  }, [activeSegmentIndex]);

  const handleSave = async () => {
    if (!onSaveTranscript) return;
    setIsSaving(true);
    try {
      await onSaveTranscript(transcriptText);
      setIsEditingTranscript(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSeekSegment = (seconds: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = seconds;
    setCurrentTime(seconds);
    media.play().catch(() => undefined);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (!isMod) return;

      const key = event.key.toLowerCase();
      if (key === "e") {
        const active = document.activeElement;
        const withinTranscript =
          !!active && !!containerRef.current && containerRef.current.contains(active);

        if (!withinTranscript) return;
        event.preventDefault();
        setIsEditingTranscript((prev) => !prev);
        return;
      }

      if (key !== "s") return;

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
              <audio
                ref={(node) => {
                  mediaRef.current = node;
                }}
                controls
                className="w-full"
                src={sourceUrl}
                preload="metadata"
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <video
                ref={(node) => {
                  mediaRef.current = node;
                }}
                controls
                className="h-full w-full"
                src={sourceUrl}
                preload="metadata"
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              />
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
              variant={isEditingTranscript ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setIsEditingTranscript((prev) => !prev)}
            >
              <Pencil className="h-3.5 w-3.5" />
              {isEditingTranscript ? "Display" : "Edit"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setTranscriptOnly((prev) => !prev)}
            >
              {transcriptOnly ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {transcriptOnly ? "Show Media" : "Transcript Only"}
            </Button>
            {isEditingTranscript && (
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
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 p-3">
          {isEditingTranscript ? (
            <Textarea
              ref={textareaRef}
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              placeholder="Edit timestamped transcript lines, then save."
              className="h-full w-full resize-none text-sm leading-relaxed overflow-auto"
            />
          ) : (
            <div className="h-full min-h-0 rounded-md border border-border bg-background/40">
              <div className="px-3 py-2 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                Timestamped Transcript
              </div>
              <div className="h-[calc(100%-33px)] overflow-auto p-2 space-y-1">
                {transcriptSegments.length > 0 ? (
                  transcriptSegments.map((segment, index) => (
                    <button
                      key={`${segment.start}-${segment.end}-${index}`}
                      ref={(node) => {
                        segmentRefs.current[index] = node;
                      }}
                      type="button"
                      onClick={() => handleSeekSegment(segment.start)}
                      className={`w-full text-left rounded px-2 py-2 text-sm transition-colors ${index === activeSegmentIndex
                          ? "bg-primary/15 text-foreground"
                          : "hover:bg-muted/60 text-muted-foreground"
                        }`}
                    >
                      <span className="inline-block w-16 text-xs text-primary/90 align-top pt-0.5">
                        {formatTimestamp(segment.start)}
                      </span>
                      <span className="inline-block max-w-[calc(100%-4.25rem)] whitespace-pre-wrap break-words leading-relaxed">
                        {segment.text}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground px-2 py-3">
                    No timestamped segments available. Start transcription or switch to Edit to write timestamped lines.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
