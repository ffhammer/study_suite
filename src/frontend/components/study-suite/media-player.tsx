"use client";

import { useState } from "react";
import { Play, Pause, Volume2, Maximize2, SkipBack, SkipForward, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WorkspaceFileItem } from "@/lib/file-tree";

interface MediaPlayerProps {
  file: WorkspaceFileItem;
  sourceUrl: string;
}

export function MediaPlayer({ file, sourceUrl }: MediaPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState([35]);
  const [volume, setVolume] = useState([80]);

  return (
    <div className="h-full flex flex-col">
      {/* Video Player Area */}
      <div className="bg-black aspect-video relative flex items-center justify-center shrink-0">
        <video
          controls
          className="absolute inset-0 h-full w-full"
          src={sourceUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-2 mx-auto backdrop-blur-sm">
              {isPlaying ? (
                <Pause className="h-8 w-8 text-white" />
              ) : (
                <Play className="h-8 w-8 text-white ml-1" />
              )}
            </div>
            <p className="text-white/60 text-sm">{file.name}</p>
          </div>
        </div>
        
        {/* Video Controls Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pointer-events-none">
          <div className="space-y-2">
            <Slider
              value={progress}
              onValueChange={setProgress}
              max={100}
              step={1}
              className="w-full"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20"
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
                <span className="text-white/80 text-xs ml-2">12:45 / 36:20</span>
              </div>
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-white/80" />
                <Slider
                  value={volume}
                  onValueChange={setVolume}
                  max={100}
                  step={1}
                  className="w-20"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20"
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transcript Area */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="h-9 border-b border-border flex items-center px-3 shrink-0 bg-card">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Transcript
          </span>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4">
            <div className="prose prose-sm prose-invert max-w-none">
              {(file.transcriptText || "No transcript available yet.").split("\n\n").map((paragraph, index) => (
                <p
                  key={index}
                  className="text-sm text-foreground/80 leading-relaxed mb-3 last:mb-0"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
