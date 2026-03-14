"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crop, FlipHorizontal, FlipVertical, RotateCcw, RotateCw, Save, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceFileItem } from "@/lib/file-tree";

interface CropRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface ImageEditorProps {
    file: WorkspaceFileItem;
    sourceUrl: string;
    onSaveEditedImage: (blob: Blob, mimeType: string) => Promise<void>;
}

interface RenderRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

function getMimeTypeFromName(name: string): string {
    const lower = name.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    return "image/jpeg";
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function computeImageRect(
    containerWidth: number,
    containerHeight: number,
    imageWidth: number,
    imageHeight: number
): RenderRect {
    if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
        return { x: 0, y: 0, w: 0, h: 0 };
    }

    const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
    const w = imageWidth * scale;
    const h = imageHeight * scale;
    return {
        x: (containerWidth - w) / 2,
        y: (containerHeight - h) / 2,
        w,
        h,
    };
}

function cropRectIsValid(cropRect: CropRect | null): cropRect is CropRect {
    return Boolean(cropRect && cropRect.w > 2 && cropRect.h > 2);
}

async function loadImageElement(url: string): Promise<HTMLImageElement> {
    return await new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not load image for editing"));
        image.src = url;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error("Image export failed"));
                    return;
                }
                resolve(blob);
            },
            mimeType,
            0.92
        );
    });
}

export function ImageEditor({ file, sourceUrl, onSaveEditedImage }: ImageEditorProps) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const [displayUrl, setDisplayUrl] = useState(sourceUrl);
    const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [rotation, setRotation] = useState(0);
    const [flipX, setFlipX] = useState(false);
    const [flipY, setFlipY] = useState(false);

    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [panAtDragStart, setPanAtDragStart] = useState({ x: 0, y: 0 });

    const [cropMode, setCropMode] = useState(false);
    const [cropRect, setCropRect] = useState<CropRect | null>(null);
    const [cropDraftStart, setCropDraftStart] = useState<{ x: number; y: number } | null>(null);

    const [isSaving, setIsSaving] = useState(false);

    const imageRect = useMemo(
        () =>
            computeImageRect(
                viewportSize.width,
                viewportSize.height,
                naturalSize.width,
                naturalSize.height
            ),
        [naturalSize.height, naturalSize.width, viewportSize.height, viewportSize.width]
    );

    useEffect(() => {
        setDisplayUrl(sourceUrl);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setRotation(0);
        setFlipX(false);
        setFlipY(false);
        setCropMode(false);
        setCropRect(null);
    }, [file.id, sourceUrl]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        const updateSize = () => {
            const rect = viewport.getBoundingClientRect();
            setViewportSize({ width: rect.width, height: rect.height });
        };

        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(viewport);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const onPointerUp = () => {
            setIsDragging(false);
            setCropDraftStart(null);
        };
        window.addEventListener("pointerup", onPointerUp);
        return () => window.removeEventListener("pointerup", onPointerUp);
    }, []);

    const handleWheelZoom: React.WheelEventHandler<HTMLDivElement> = (event) => {
        if (cropMode) return;
        event.preventDefault();
        const delta = event.deltaY < 0 ? 0.12 : -0.12;
        setZoom((prev) => clamp(prev + delta, 0.25, 8));
    };

    const toLocalPoint = (clientX: number, clientY: number) => {
        const viewport = viewportRef.current;
        if (!viewport) return { x: 0, y: 0 };
        const rect = viewport.getBoundingClientRect();
        return {
            x: clientX - rect.left,
            y: clientY - rect.top,
        };
    };

    const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
        if (cropMode) {
            const point = toLocalPoint(event.clientX, event.clientY);
            const x = clamp(point.x, imageRect.x, imageRect.x + imageRect.w);
            const y = clamp(point.y, imageRect.y, imageRect.y + imageRect.h);
            setCropDraftStart({ x, y });
            setCropRect({ x, y, w: 0, h: 0 });
            return;
        }

        setIsDragging(true);
        setDragStart({ x: event.clientX, y: event.clientY });
        setPanAtDragStart(pan);
    };

    const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
        if (cropMode) {
            if (!cropDraftStart) return;
            const point = toLocalPoint(event.clientX, event.clientY);
            const x = clamp(point.x, imageRect.x, imageRect.x + imageRect.w);
            const y = clamp(point.y, imageRect.y, imageRect.y + imageRect.h);
            const left = Math.min(cropDraftStart.x, x);
            const top = Math.min(cropDraftStart.y, y);
            const right = Math.max(cropDraftStart.x, x);
            const bottom = Math.max(cropDraftStart.y, y);
            setCropRect({ x: left, y: top, w: right - left, h: bottom - top });
            return;
        }

        if (!isDragging) return;
        const dx = event.clientX - dragStart.x;
        const dy = event.clientY - dragStart.y;
        setPan({ x: panAtDragStart.x + dx, y: panAtDragStart.y + dy });
    };

    const resetView = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    const clearEdits = () => {
        setRotation(0);
        setFlipX(false);
        setFlipY(false);
        setCropRect(null);
        setCropMode(false);
        resetView();
    };

    const onSave = async () => {
        const mimeType = getMimeTypeFromName(file.name);
        setIsSaving(true);

        try {
            const sourceImage = await loadImageElement(displayUrl);

            let workingCanvas = document.createElement("canvas");
            let workingContext = workingCanvas.getContext("2d");
            if (!workingContext) throw new Error("Could not allocate canvas");

            if (cropRectIsValid(cropRect) && imageRect.w > 0 && imageRect.h > 0) {
                const scaleX = sourceImage.naturalWidth / imageRect.w;
                const scaleY = sourceImage.naturalHeight / imageRect.h;

                const sx = Math.floor((cropRect.x - imageRect.x) * scaleX);
                const sy = Math.floor((cropRect.y - imageRect.y) * scaleY);
                const sw = Math.max(1, Math.floor(cropRect.w * scaleX));
                const sh = Math.max(1, Math.floor(cropRect.h * scaleY));

                const boundedSx = clamp(sx, 0, sourceImage.naturalWidth - 1);
                const boundedSy = clamp(sy, 0, sourceImage.naturalHeight - 1);
                const boundedSw = clamp(sw, 1, sourceImage.naturalWidth - boundedSx);
                const boundedSh = clamp(sh, 1, sourceImage.naturalHeight - boundedSy);

                workingCanvas.width = boundedSw;
                workingCanvas.height = boundedSh;
                workingContext.drawImage(
                    sourceImage,
                    boundedSx,
                    boundedSy,
                    boundedSw,
                    boundedSh,
                    0,
                    0,
                    boundedSw,
                    boundedSh
                );
            } else {
                workingCanvas.width = sourceImage.naturalWidth;
                workingCanvas.height = sourceImage.naturalHeight;
                workingContext.drawImage(sourceImage, 0, 0);
            }

            if (rotation !== 0 || flipX || flipY) {
                const radians = (rotation * Math.PI) / 180;
                const absQuarterTurns = Math.abs((rotation / 90) % 2);
                const swap = absQuarterTurns === 1;

                const transformed = document.createElement("canvas");
                transformed.width = swap ? workingCanvas.height : workingCanvas.width;
                transformed.height = swap ? workingCanvas.width : workingCanvas.height;

                const tctx = transformed.getContext("2d");
                if (!tctx) throw new Error("Could not allocate transform canvas");

                tctx.translate(transformed.width / 2, transformed.height / 2);
                tctx.rotate(radians);
                tctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
                tctx.drawImage(
                    workingCanvas,
                    -workingCanvas.width / 2,
                    -workingCanvas.height / 2
                );

                workingCanvas = transformed;
            }

            const blob = await canvasToBlob(workingCanvas, mimeType);
            await onSaveEditedImage(blob, mimeType);

            setDisplayUrl(
                `${sourceUrl}${sourceUrl.includes("?") ? "&" : "?"}v=${Date.now()}`
            );
            clearEdits();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="h-full min-h-0 flex flex-col bg-card">
            <div className="border-b border-border px-3 py-2 flex items-center justify-between gap-2 shrink-0">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Image Editor</div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setZoom((z) => clamp(z - 0.15, 0.25, 8))}>
                        <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setZoom((z) => clamp(z + 0.15, 0.25, 8))}>
                        <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setRotation((r) => (r - 90 + 360) % 360)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setRotation((r) => (r + 90) % 360)}>
                        <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setFlipX((v) => !v)}>
                        <FlipHorizontal className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setFlipY((v) => !v)}>
                        <FlipVertical className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant={cropMode ? "secondary" : "ghost"} className="h-7 px-2" onClick={() => setCropMode((v) => !v)}>
                        <Crop className="h-3.5 w-3.5" />
                        <span className="ml-1 text-xs">Crop</span>
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={resetView}>Reset View</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={clearEdits}>Clear Edits</Button>
                    <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => onSave().catch(() => undefined)} disabled={isSaving}>
                        <Save className="h-3.5 w-3.5" />
                        {isSaving ? "Saving..." : "Save"}
                    </Button>
                </div>
            </div>

            <div className="px-3 py-1 text-[11px] text-muted-foreground border-b border-border shrink-0">
                {cropMode
                    ? "Crop mode: drag on image to select crop rectangle."
                    : "Zoom with wheel/buttons, drag to pan, rotate/flip then save."}
            </div>

            <div
                ref={viewportRef}
                className="relative flex-1 min-h-0 overflow-hidden bg-black/95 cursor-grab active:cursor-grabbing"
                onWheel={handleWheelZoom}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
            >
                <img
                    src={displayUrl}
                    alt={file.name}
                    onLoad={(event) => {
                        const target = event.currentTarget;
                        setNaturalSize({ width: target.naturalWidth, height: target.naturalHeight });
                    }}
                    className="absolute left-1/2 top-1/2 max-h-full max-w-full select-none"
                    draggable={false}
                    style={{
                        transform: cropMode
                            ? "translate(-50%, -50%)"
                            : `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${flipX ? -zoom : zoom}, ${flipY ? -zoom : zoom})`,
                        transformOrigin: "center center",
                        pointerEvents: "none",
                        imageRendering: "auto",
                    }}
                />

                {cropMode && cropRectIsValid(cropRect) && (
                    <div
                        className="absolute border-2 border-emerald-400 bg-emerald-300/15"
                        style={{
                            left: cropRect.x,
                            top: cropRect.y,
                            width: cropRect.w,
                            height: cropRect.h,
                        }}
                    />
                )}
            </div>
        </div>
    );
}
