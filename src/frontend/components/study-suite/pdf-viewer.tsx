"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Search, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PdfViewerProps {
  sourceUrl: string;
  fileName: string;
}

export function PdfViewer({ sourceUrl, fileName }: PdfViewerProps) {
  const [page, setPage] = useState(1);
  const [findQuery, setFindQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const iframeSrc = useMemo(() => {
    const hash: string[] = [`page=${Math.max(1, page)}`, "view=FitH"];
    if (findQuery.trim()) {
      hash.push(`search=${encodeURIComponent(findQuery.trim())}`);
    }
    return `${sourceUrl}#${hash.join("&")}`;
  }, [sourceUrl, page, findQuery]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      const insideViewer =
        !!active && !!containerRef.current && containerRef.current.contains(active);

      if (!insideViewer) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPage((prev) => Math.max(1, prev - 1));
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setPage((prev) => prev + 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div ref={containerRef} className="h-full flex flex-col min-h-0 bg-card">
      <div className="h-10 border-b border-border px-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground truncate" title={fileName}>
            {fileName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>

          <Input
            type="number"
            min={1}
            value={page}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isNaN(next)) {
                setPage(Math.max(1, next));
              }
            }}
            className="h-7 w-20 text-xs"
            title="Page"
          />

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setPage((prev) => prev + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>

          <div className="relative w-56">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
            <Input
              value={findQuery}
              onChange={(event) => setFindQuery(event.target.value)}
              placeholder="Find in PDF"
              className="h-7 text-xs pl-7"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-black/60">
        <iframe
          key={iframeSrc}
          src={iframeSrc}
          title={fileName}
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
}
