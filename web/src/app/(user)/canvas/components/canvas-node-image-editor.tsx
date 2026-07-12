"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { App, Button, ColorPicker, Input, Modal, Segmented, Slider } from "antd";
import {
    Brush,
    Check,
    Crop,
    Eraser,
    Eye,
    EyeOff,
    Hand,
    ImagePlus,
    Redo2,
    RotateCcw,
    Save,
    ScanSearch,
    Trash2,
    Type,
    Undo2,
    WandSparkles,
    X,
    ZoomIn,
    ZoomOut,
} from "lucide-react";

import { readImageMeta } from "@/lib/image-utils";

export type CanvasImageEditorMode = "mask" | "crop" | "text";
export type CanvasImageEditorResultAction = "new" | "replace";

export type CanvasImageEditorLocalPayload = {
    action: CanvasImageEditorResultAction;
    dataUrl: string;
    title: string;
};

export type CanvasImageEditorMaskPayload = {
    action: CanvasImageEditorResultAction;
    prompt: string;
    maskDataUrl: string;
};

type CropRect = { x: number; y: number; width: number; height: number };
type TextAnnotation = { id: string; text: string; x: number; y: number; fontSize: number; color: string };
type LocalSnapshot = { crop: CropRect; annotations: TextAnnotation[] };
type DrawMode = "paint" | "erase";
type CropDrag = "move" | "nw" | "ne" | "sw" | "se";

const fullCrop: CropRect = { x: 0, y: 0, width: 1, height: 1 };
const defaultBrushSize = 96;
const maskFillColor = "rgba(47, 128, 255, .36)";

export function CanvasNodeImageEditor({
    dataUrl,
    open,
    initialMode = "mask",
    onClose,
    onSave,
    onGenerate,
}: {
    dataUrl: string;
    open: boolean;
    initialMode?: CanvasImageEditorMode;
    onClose: () => void;
    onSave: (payload: CanvasImageEditorLocalPayload) => void | Promise<void>;
    onGenerate: (payload: CanvasImageEditorMaskPayload) => void | Promise<void>;
}) {
    const { message } = App.useApp();
    const imageBoxRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const maskPreviewRef = useRef<HTMLCanvasElement>(null);
    const textPreviewRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef<{ active: boolean; last: Point | null }>({ active: false, last: null });
    const panningRef = useRef<{ active: boolean; x: number; y: number; scrollLeft: number; scrollTop: number }>({ active: false, x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
    const cropRef = useRef<CropRect>(fullCrop);
    const localHistoryRef = useRef<LocalSnapshot[]>([{ crop: fullCrop, annotations: [] }]);
    const localHistoryIndexRef = useRef(0);
    const maskHistoryRef = useRef<ImageData[]>([]);
    const maskHistoryIndexRef = useRef(-1);
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const [mode, setMode] = useState<CanvasImageEditorMode>(initialMode);
    const [action, setAction] = useState<CanvasImageEditorResultAction>("new");
    const [zoom, setZoom] = useState(1);
    const [panMode, setPanMode] = useState(false);
    const [compareOriginal, setCompareOriginal] = useState(false);
    const [crop, setCrop] = useState<CropRect>(fullCrop);
    const [annotations, setAnnotations] = useState<TextAnnotation[]>([]);
    const [textDraft, setTextDraft] = useState("文字标注");
    const [fontSize, setFontSize] = useState(48);
    const [textColor, setTextColor] = useState("#ffffff");
    const [brushSize, setBrushSize] = useState(defaultBrushSize);
    const [drawMode, setDrawMode] = useState<DrawMode>("paint");
    const [prompt, setPrompt] = useState("");
    const [, setHistoryVersion] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    const localChanged = useMemo(() => !sameCrop(crop, fullCrop) || annotations.length > 0, [annotations.length, crop]);
    const canUndo = mode === "mask" ? maskHistoryIndexRef.current > 0 : localHistoryIndexRef.current > 0;
    const canRedo = mode === "mask" ? maskHistoryIndexRef.current >= 0 && maskHistoryIndexRef.current < maskHistoryRef.current.length - 1 : localHistoryIndexRef.current < localHistoryRef.current.length - 1;

    useEffect(() => {
        if (!open) return;
        setMode(initialMode);
        setAction("new");
        setZoom(1);
        setPanMode(false);
        setCompareOriginal(false);
        setCrop(fullCrop);
        cropRef.current = fullCrop;
        setAnnotations([]);
        setTextDraft("文字标注");
        setFontSize(48);
        setTextColor("#ffffff");
        setBrushSize(defaultBrushSize);
        setDrawMode("paint");
        setPrompt("");
        setSubmitting(false);
        localHistoryRef.current = [{ crop: fullCrop, annotations: [] }];
        localHistoryIndexRef.current = 0;
        maskHistoryRef.current = [];
        maskHistoryIndexRef.current = -1;
        setHistoryVersion((value) => value + 1);
        void readImageMeta(dataUrl).then(setImage);
    }, [dataUrl, initialMode, open]);

    useEffect(() => {
        if (!image) return;
        for (const canvas of [maskCanvasRef.current, maskPreviewRef.current, textPreviewRef.current]) {
            if (!canvas) continue;
            canvas.width = image.width;
            canvas.height = image.height;
            canvas.getContext("2d")?.clearRect(0, 0, image.width, image.height);
        }
        captureInitialMask(maskCanvasRef.current, maskHistoryRef, maskHistoryIndexRef);
        renderTextPreview(textPreviewRef.current, annotations, image);
        setHistoryVersion((value) => value + 1);
    }, [image]);

    useEffect(() => {
        if (image) renderTextPreview(textPreviewRef.current, annotations, image);
    }, [annotations, image]);

    const commitLocalSnapshot = (nextCrop: CropRect, nextAnnotations: TextAnnotation[]) => {
        const next: LocalSnapshot = { crop: { ...nextCrop }, annotations: nextAnnotations.map((item) => ({ ...item })) };
        const history = localHistoryRef.current.slice(0, localHistoryIndexRef.current + 1);
        const previous = history[history.length - 1];
        if (previous && sameCrop(previous.crop, next.crop) && sameAnnotations(previous.annotations, next.annotations)) return;
        history.push(next);
        localHistoryRef.current = history.slice(-30);
        localHistoryIndexRef.current = localHistoryRef.current.length - 1;
        setHistoryVersion((value) => value + 1);
    };

    const restoreLocalSnapshot = (snapshot: LocalSnapshot) => {
        const nextCrop = { ...snapshot.crop };
        cropRef.current = nextCrop;
        setCrop(nextCrop);
        setAnnotations(snapshot.annotations.map((item) => ({ ...item })));
    };

    const undo = () => {
        if (mode === "mask") {
            if (maskHistoryIndexRef.current <= 0) return;
            maskHistoryIndexRef.current -= 1;
            restoreMaskHistory(maskCanvasRef.current, maskPreviewRef.current, maskHistoryRef.current[maskHistoryIndexRef.current]);
        } else {
            if (localHistoryIndexRef.current <= 0) return;
            localHistoryIndexRef.current -= 1;
            restoreLocalSnapshot(localHistoryRef.current[localHistoryIndexRef.current]);
        }
        setHistoryVersion((value) => value + 1);
    };

    const redo = () => {
        if (mode === "mask") {
            if (maskHistoryIndexRef.current >= maskHistoryRef.current.length - 1) return;
            maskHistoryIndexRef.current += 1;
            restoreMaskHistory(maskCanvasRef.current, maskPreviewRef.current, maskHistoryRef.current[maskHistoryIndexRef.current]);
        } else {
            if (localHistoryIndexRef.current >= localHistoryRef.current.length - 1) return;
            localHistoryIndexRef.current += 1;
            restoreLocalSnapshot(localHistoryRef.current[localHistoryIndexRef.current]);
        }
        setHistoryVersion((value) => value + 1);
    };

    const resetCurrentMode = () => {
        if (mode === "mask") {
            clearCanvas(maskCanvasRef.current);
            clearCanvas(maskPreviewRef.current);
            captureMaskHistory(maskCanvasRef.current, maskHistoryRef, maskHistoryIndexRef);
        } else if (mode === "crop") {
            cropRef.current = fullCrop;
            setCrop(fullCrop);
            commitLocalSnapshot(fullCrop, annotations);
        } else {
            setAnnotations([]);
            commitLocalSnapshot(crop, []);
        }
        setHistoryVersion((value) => value + 1);
    };

    const drawMask = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const canvas = maskCanvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const point = readCanvasPoint(event.currentTarget, event.clientX, event.clientY);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = brushSize;
        context.globalCompositeOperation = drawMode === "paint" ? "source-over" : "destination-out";
        context.strokeStyle = "#000";
        context.fillStyle = "#000";
        drawStroke(context, drawingRef.current.last || point, point, brushSize);
        drawingRef.current.last = point;
        renderMaskPreview(canvas, maskPreviewRef.current);
    };

    const startMaskDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (panMode || compareOriginal) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drawingRef.current = { active: true, last: null };
        drawMask(event);
    };

    const stopMaskDraw = () => {
        if (!drawingRef.current.active) return;
        drawingRef.current = { active: false, last: null };
        const canvas = maskCanvasRef.current;
        if (canvas) {
            renderMaskPreview(canvas, maskPreviewRef.current, true);
            captureMaskHistory(canvas, maskHistoryRef, maskHistoryIndexRef);
            setHistoryVersion((value) => value + 1);
        }
    };

    const invertMask = () => {
        const canvas = maskCanvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        for (let index = 3; index < imageData.data.length; index += 4) imageData.data[index] = imageData.data[index] > 0 ? 0 : 255;
        context.putImageData(imageData, 0, 0);
        renderMaskPreview(canvas, maskPreviewRef.current, true);
        captureMaskHistory(canvas, maskHistoryRef, maskHistoryIndexRef);
        setHistoryVersion((value) => value + 1);
    };

    const startCropDrag = (drag: CropDrag, event: ReactPointerEvent) => {
        if (panMode || compareOriginal) return;
        const bounds = imageBoxRef.current?.getBoundingClientRect();
        if (!bounds) return;
        event.preventDefault();
        event.stopPropagation();
        const start = { x: event.clientX, y: event.clientY, crop: { ...cropRef.current } };
        const move = (pointer: PointerEvent) => {
            const dx = (pointer.clientX - start.x) / Math.max(1, bounds.width);
            const dy = (pointer.clientY - start.y) / Math.max(1, bounds.height);
            const next = drag === "move" ? moveCrop(start.crop, dx, dy) : resizeCrop(start.crop, dx, dy, drag);
            cropRef.current = next;
            setCrop(next);
        };
        const up = () => {
            document.removeEventListener("pointermove", move);
            document.removeEventListener("pointerup", up);
            commitLocalSnapshot(cropRef.current, annotations);
        };
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", up);
    };

    const applyCropPreset = (ratio: number | null) => {
        if (!image) return;
        const next = ratio ? fitAspectCrop(image.width / image.height, ratio) : fullCrop;
        cropRef.current = next;
        setCrop(next);
        commitLocalSnapshot(next, annotations);
    };

    const addTextAnnotation = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (mode !== "text" || panMode || compareOriginal || !image || !textDraft.trim()) return;
        const point = readCanvasPoint(event.currentTarget, event.clientX, event.clientY);
        const next = [
            ...annotations,
            {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                text: textDraft.trim(),
                x: point.x / image.width,
                y: point.y / image.height,
                fontSize,
                color: textColor,
            },
        ];
        setAnnotations(next);
        commitLocalSnapshot(crop, next);
    };

    const removeAnnotation = (id: string) => {
        const next = annotations.filter((item) => item.id !== id);
        setAnnotations(next);
        commitLocalSnapshot(crop, next);
    };

    const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!panMode) return;
        const stage = stageRef.current;
        if (!stage) return;
        event.preventDefault();
        panningRef.current = { active: true, x: event.clientX, y: event.clientY, scrollLeft: stage.scrollLeft, scrollTop: stage.scrollTop };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!panningRef.current.active) return;
        const stage = stageRef.current;
        if (!stage) return;
        stage.scrollLeft = panningRef.current.scrollLeft - (event.clientX - panningRef.current.x);
        stage.scrollTop = panningRef.current.scrollTop - (event.clientY - panningRef.current.y);
    };

    const submitLocal = async () => {
        if (!image || !localChanged) return message.warning("请先完成裁剪或添加文字标注");
        setSubmitting(true);
        try {
            const result = await renderLocalResult(dataUrl, image, crop, annotations);
            await onSave({ action, dataUrl: result, title: annotations.length ? "文字标注图片" : "裁剪图片" });
        } finally {
            setSubmitting(false);
        }
    };

    const submitMask = async () => {
        const maskCanvas = maskCanvasRef.current;
        if (!prompt.trim()) return message.warning("请输入局部修改要求");
        if (!maskCanvas || !canvasHasPaint(maskCanvas)) return message.warning("请先涂抹需要修改的区域");
        setSubmitting(true);
        try {
            await onGenerate({ action, prompt: prompt.trim(), maskDataUrl: buildEditMask(maskCanvas) });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            title={null}
            open={open && Boolean(dataUrl)}
            onCancel={onClose}
            closable={false}
            footer={null}
            centered
            destroyOnHidden
            width="min(1480px, calc(100vw - 24px))"
            styles={{ body: { padding: 0 } }}
        >
            <div className="flex h-[calc(100dvh-24px)] min-h-0 flex-col overflow-hidden sm:h-[min(900px,calc(100vh-56px))]">
                <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
                    <div className="mr-auto min-w-0">
                        <div className="truncate text-sm font-semibold">图片编辑</div>
                        <div className="text-[11px] opacity-50">{image ? `${image.width} × ${image.height}px` : "读取中"}</div>
                    </div>
                    <Segmented
                        value={mode}
                        onChange={(value) => {
                            setMode(value as CanvasImageEditorMode);
                            setPanMode(false);
                        }}
                        options={[
                            { value: "mask", label: <ModeLabel icon={<Brush className="size-3.5" />} text="局部编辑" /> },
                            { value: "crop", label: <ModeLabel icon={<Crop className="size-3.5" />} text="裁剪" /> },
                            { value: "text", label: <ModeLabel icon={<Type className="size-3.5" />} text="文字" /> },
                        ]}
                    />
                    <div className="flex items-center gap-1">
                        <IconButton title="撤销" disabled={!canUndo} onClick={undo} icon={<Undo2 className="size-4" />} />
                        <IconButton title="重做" disabled={!canRedo} onClick={redo} icon={<Redo2 className="size-4" />} />
                        <IconButton title="重置当前工具" onClick={resetCurrentMode} icon={<RotateCcw className="size-4" />} />
                        <IconButton title="关闭" onClick={onClose} icon={<X className="size-4" />} />
                    </div>
                </header>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden">
                    <section className="relative h-[46vh] min-h-[300px] shrink-0 overflow-hidden bg-[#eef1f5] dark:bg-[#101216] lg:h-auto lg:min-h-0">
                        <div className="absolute left-3 top-3 z-30 flex items-center gap-1 rounded-lg border bg-white/90 p-1 shadow-sm backdrop-blur dark:bg-black/70">
                            <IconButton title="缩小" onClick={() => setZoom((value) => clamp(value - 0.1, 0.3, 3))} icon={<ZoomOut className="size-4" />} />
                            <button type="button" className="h-9 min-w-14 rounded-md px-2 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setZoom(1)}>
                                {Math.round(zoom * 100)}%
                            </button>
                            <IconButton title="放大" onClick={() => setZoom((value) => clamp(value + 0.1, 0.3, 3))} icon={<ZoomIn className="size-4" />} />
                            <IconButton title="拖动画面" active={panMode} onClick={() => setPanMode((value) => !value)} icon={<Hand className="size-4" />} />
                            <IconButton title={compareOriginal ? "显示编辑效果" : "查看原图"} active={compareOriginal} onClick={() => setCompareOriginal((value) => !value)} icon={compareOriginal ? <EyeOff className="size-4" /> : <Eye className="size-4" />} />
                        </div>
                        <div
                            ref={stageRef}
                            className={`thin-scrollbar h-full overflow-auto p-10 ${panMode ? "cursor-grab active:cursor-grabbing" : ""}`}
                            onPointerDown={startPan}
                            onPointerMove={movePan}
                            onPointerUp={() => (panningRef.current.active = false)}
                            onPointerCancel={() => (panningRef.current.active = false)}
                        >
                            <div className="flex min-h-full min-w-full items-center justify-center">
                                <div className="flex items-center justify-center" style={{ width: `${Math.max(100, zoom * 100)}%`, minWidth: zoom > 1 ? `${zoom * 100}%` : undefined }}>
                                    <div ref={imageBoxRef} className="relative inline-block max-w-full overflow-hidden rounded-lg bg-black shadow-2xl select-none" style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}>
                                        <img src={dataUrl} alt="" className="block max-h-[calc(100vh-190px)] max-w-full" draggable={false} />
                                        {image ? (
                                            <>
                                                <canvas ref={maskCanvasRef} width={image.width} height={image.height} className="hidden" />
                                                <canvas
                                                    ref={maskPreviewRef}
                                                    width={image.width}
                                                    height={image.height}
                                                    className={`absolute inset-0 h-full w-full touch-none ${mode === "mask" && !panMode ? "cursor-crosshair" : "pointer-events-none"} ${compareOriginal ? "hidden" : ""}`}
                                                    onPointerDown={startMaskDraw}
                                                    onPointerMove={(event) => drawingRef.current.active && drawMask(event)}
                                                    onPointerUp={stopMaskDraw}
                                                    onPointerCancel={stopMaskDraw}
                                                />
                                                <canvas
                                                    ref={textPreviewRef}
                                                    width={image.width}
                                                    height={image.height}
                                                    className={`absolute inset-0 h-full w-full touch-none ${mode === "text" && !panMode ? "cursor-text" : "pointer-events-none"} ${compareOriginal ? "hidden" : ""}`}
                                                    onPointerDown={addTextAnnotation}
                                                />
                                            </>
                                        ) : null}
                                        {mode === "crop" && !compareOriginal ? <CropOverlay crop={crop} onStart={startCropDrag} disabled={panMode} /> : null}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <aside className="thin-scrollbar flex min-h-[360px] flex-col gap-4 overflow-y-auto border-t bg-white p-4 dark:bg-[#17191d] lg:min-h-0 lg:border-l lg:border-t-0">
                        {mode === "mask" ? (
                            <>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button type={drawMode === "paint" ? "primary" : "default"} icon={<Brush className="size-4" />} onClick={() => setDrawMode("paint")}>
                                        画笔
                                    </Button>
                                    <Button type={drawMode === "erase" ? "primary" : "default"} icon={<Eraser className="size-4" />} onClick={() => setDrawMode("erase")}>
                                        擦除
                                    </Button>
                                </div>
                                <ControlLabel label="画笔大小" value={`${brushSize}px`} />
                                <Slider min={8} max={200} step={2} value={brushSize} onChange={setBrushSize} />
                                <div className="grid grid-cols-2 gap-2">
                                    <Button icon={<ScanSearch className="size-4" />} onClick={invertMask}>反选蒙版</Button>
                                    <Button icon={<Trash2 className="size-4" />} onClick={resetCurrentMode}>清空蒙版</Button>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-xs font-medium opacity-65">修改要求</div>
                                    <Input.TextArea value={prompt} rows={7} placeholder="例如：把选中区域改成蓝色外套，其他区域保持不变" onChange={(event) => setPrompt(event.target.value)} />
                                </div>
                            </>
                        ) : mode === "crop" ? (
                            <>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        ["自由", null],
                                        ["1:1", 1],
                                        ["4:3", 4 / 3],
                                        ["3:4", 3 / 4],
                                        ["16:9", 16 / 9],
                                        ["9:16", 9 / 16],
                                    ].map(([label, ratio]) => (
                                        <Button key={String(label)} onClick={() => applyCropPreset(ratio as number | null)}>{String(label)}</Button>
                                    ))}
                                </div>
                                <div className="rounded-lg border p-3 text-xs leading-6 opacity-70">
                                    <div>输出区域 {image ? `${Math.round(crop.width * image.width)} × ${Math.round(crop.height * image.height)}px` : "-"}</div>
                                    <div>拖动选框移动，拖动四角调整范围</div>
                                </div>
                            </>
                        ) : (
                            <>
                                <Input value={textDraft} maxLength={80} placeholder="输入标注文字" onChange={(event) => setTextDraft(event.target.value)} />
                                <ControlLabel label="字号" value={`${fontSize}px`} />
                                <Slider min={16} max={160} step={2} value={fontSize} onChange={setFontSize} />
                                <div className="flex items-center justify-between gap-3 rounded-lg border p-2">
                                    <span className="text-xs font-medium opacity-65">文字颜色</span>
                                    <ColorPicker value={textColor} onChange={(_, hex) => setTextColor(hex)} />
                                </div>
                                <div className="rounded-lg border p-3 text-xs leading-5 opacity-70">在图片上点击即可添加文字标注。</div>
                                {annotations.length ? (
                                    <div className="space-y-2">
                                        {annotations.map((annotation, index) => (
                                            <div key={annotation.id} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
                                                <span className="grid size-6 shrink-0 place-items-center rounded bg-black/5 font-semibold dark:bg-white/10">{index + 1}</span>
                                                <span className="min-w-0 flex-1 truncate">{annotation.text}</span>
                                                <button type="button" className="grid size-8 place-items-center rounded-md hover:bg-black/5 dark:hover:bg-white/10" aria-label="删除文字标注" onClick={() => removeAnnotation(annotation.id)}>
                                                    <X className="size-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </>
                        )}

                        <div className="mt-auto space-y-3 border-t pt-4">
                            <Segmented
                                block
                                value={action}
                                onChange={(value) => setAction(value as CanvasImageEditorResultAction)}
                                options={[
                                    { value: "new", label: <ModeLabel icon={<ImagePlus className="size-3.5" />} text="生成新节点" /> },
                                    { value: "replace", label: <ModeLabel icon={<Save className="size-3.5" />} text="替换当前图" /> },
                                ]}
                            />
                            <div className="grid grid-cols-[auto_1fr] gap-2">
                                <Button icon={<X className="size-4" />} onClick={onClose}>取消</Button>
                                {mode === "mask" ? (
                                    <Button type="primary" loading={submitting} icon={<WandSparkles className="size-4" />} onClick={() => void submitMask()}>AI 修改</Button>
                                ) : (
                                    <Button type="primary" loading={submitting} icon={<Check className="size-4" />} onClick={() => void submitLocal()}>应用编辑</Button>
                                )}
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </Modal>
    );
}

type Point = { x: number; y: number };

function ModeLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
    return <span className="inline-flex items-center gap-1.5">{icon}<span>{text}</span></span>;
}

function IconButton({ title, icon, onClick, active = false, disabled = false }: { title: string; icon: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) {
    return (
        <button type="button" title={title} aria-label={title} disabled={disabled} className={`grid size-9 place-items-center rounded-md transition ${active ? "bg-[#2f80ff] text-white" : "hover:bg-black/5 dark:hover:bg-white/10"} disabled:cursor-not-allowed disabled:opacity-30`} onClick={onClick}>
            {icon}
        </button>
    );
}

function ControlLabel({ label, value }: { label: string; value: string }) {
    return <div className="flex items-center justify-between text-xs"><span className="font-medium opacity-65">{label}</span><span className="font-semibold tabular-nums">{value}</span></div>;
}

function CropOverlay({ crop, onStart, disabled }: { crop: CropRect; onStart: (drag: CropDrag, event: ReactPointerEvent) => void; disabled: boolean }) {
    const style = { left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` };
    return (
        <div className={`absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,.55)] ${disabled ? "pointer-events-none" : "cursor-move"}`} style={style} onPointerDown={(event) => onStart("move", event)}>
            <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/50" />
            <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/50" />
            <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/50" />
            <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/50" />
            {(["nw", "ne", "sw", "se"] as const).map((handle) => (
                <button key={handle} type="button" className="absolute size-4 rounded border-2 border-white bg-[#2f80ff]" style={cropHandleStyle(handle)} aria-label="调整裁剪范围" onPointerDown={(event) => onStart(handle, event)} />
            ))}
        </div>
    );
}

function cropHandleStyle(handle: Exclude<CropDrag, "move">) {
    return {
        left: handle.includes("w") ? "-8px" : "calc(100% - 8px)",
        top: handle.includes("n") ? "-8px" : "calc(100% - 8px)",
        cursor: `${handle}-resize`,
    };
}

function readCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): Point {
    const rect = canvas.getBoundingClientRect();
    return { x: ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width, y: ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height };
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawStroke(context: CanvasRenderingContext2D, from: Point, to: Point, size: number) {
    if (from.x === to.x && from.y === to.y) {
        context.beginPath();
        context.arc(to.x, to.y, size / 2, 0, Math.PI * 2);
        context.fill();
        return;
    }
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
}

function canvasHasPaint(canvas: HTMLCanvasElement) {
    const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!data) return false;
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return true;
    return false;
}

function renderMaskPreview(maskCanvas: HTMLCanvasElement, previewCanvas: HTMLCanvasElement | null, withBorder = false) {
    const context = previewCanvas?.getContext("2d");
    if (!previewCanvas || !context) return;
    context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    context.fillStyle = maskFillColor;
    context.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(maskCanvas, 0, 0);
    context.globalCompositeOperation = "source-over";
    if (withBorder) {
        context.strokeStyle = "rgba(255,255,255,.9)";
        context.lineWidth = Math.max(2, previewCanvas.width / 600);
        context.setLineDash([10, 7]);
        context.strokeRect(1, 1, previewCanvas.width - 2, previewCanvas.height - 2);
        context.setLineDash([]);
    }
}

function captureInitialMask(canvas: HTMLCanvasElement | null, historyRef: React.MutableRefObject<ImageData[]>, indexRef: React.MutableRefObject<number>) {
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    historyRef.current = [context.getImageData(0, 0, canvas.width, canvas.height)];
    indexRef.current = 0;
}

function captureMaskHistory(canvas: HTMLCanvasElement | null, historyRef: React.MutableRefObject<ImageData[]>, indexRef: React.MutableRefObject<number>) {
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const history = historyRef.current.slice(0, indexRef.current + 1);
    history.push(context.getImageData(0, 0, canvas.width, canvas.height));
    historyRef.current = history.slice(-20);
    indexRef.current = historyRef.current.length - 1;
}

function restoreMaskHistory(maskCanvas: HTMLCanvasElement | null, previewCanvas: HTMLCanvasElement | null, imageData: ImageData | undefined) {
    const context = maskCanvas?.getContext("2d");
    if (!maskCanvas || !context || !imageData) return;
    context.putImageData(imageData, 0, 0);
    renderMaskPreview(maskCanvas, previewCanvas, canvasHasPaint(maskCanvas));
}

function buildEditMask(selectionCanvas: HTMLCanvasElement) {
    const canvas = document.createElement("canvas");
    canvas.width = selectionCanvas.width;
    canvas.height = selectionCanvas.height;
    const context = canvas.getContext("2d");
    const selectionContext = selectionCanvas.getContext("2d");
    if (!context || !selectionContext) return selectionCanvas.toDataURL("image/png");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const selection = selectionContext.getImageData(0, 0, canvas.width, canvas.height);
    const mask = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 3; index < mask.data.length; index += 4) if (selection.data[index] > 0) mask.data[index] = 0;
    context.putImageData(mask, 0, 0);
    return canvas.toDataURL("image/png");
}

function moveCrop(crop: CropRect, dx: number, dy: number): CropRect {
    return { ...crop, x: clamp(crop.x + dx, 0, 1 - crop.width), y: clamp(crop.y + dy, 0, 1 - crop.height) };
}

function resizeCrop(crop: CropRect, dx: number, dy: number, handle: Exclude<CropDrag, "move">): CropRect {
    const next = { ...crop };
    if (handle.includes("e")) next.width += dx;
    if (handle.includes("s")) next.height += dy;
    if (handle.includes("w")) { next.x += dx; next.width -= dx; }
    if (handle.includes("n")) { next.y += dy; next.height -= dy; }
    next.width = clamp(next.width, 0.06, 1);
    next.height = clamp(next.height, 0.06, 1);
    next.x = clamp(next.x, 0, 1 - next.width);
    next.y = clamp(next.y, 0, 1 - next.height);
    return next;
}

function fitAspectCrop(imageRatio: number, targetRatio: number): CropRect {
    if (imageRatio > targetRatio) {
        const width = targetRatio / imageRatio;
        return { x: (1 - width) / 2, y: 0, width, height: 1 };
    }
    const height = imageRatio / targetRatio;
    return { x: 0, y: (1 - height) / 2, width: 1, height };
}

function renderTextPreview(canvas: HTMLCanvasElement | null, annotations: TextAnnotation[], image: { width: number; height: number }) {
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, image.width, image.height);
    annotations.forEach((annotation) => drawAnnotation(context, annotation, image.width, image.height));
}

function drawAnnotation(context: CanvasRenderingContext2D, annotation: TextAnnotation, width: number, height: number, offsetX = 0, offsetY = 0) {
    const x = annotation.x * width - offsetX;
    const y = annotation.y * height - offsetY;
    context.save();
    context.font = `600 ${annotation.fontSize}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.strokeStyle = "rgba(0,0,0,.72)";
    context.lineWidth = Math.max(2, annotation.fontSize * 0.12);
    context.strokeText(annotation.text, x, y);
    context.fillStyle = annotation.color;
    context.fillText(annotation.text, x, y);
    context.restore();
}

async function renderLocalResult(dataUrl: string, image: { width: number; height: number }, crop: CropRect, annotations: TextAnnotation[]) {
    const source = await loadImage(dataUrl);
    const sourceX = Math.round(crop.x * image.width);
    const sourceY = Math.round(crop.y * image.height);
    const width = Math.max(1, Math.round(crop.width * image.width));
    const height = Math.max(1, Math.round(crop.height * image.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建图片编辑画布");
    context.drawImage(source, sourceX, sourceY, width, height, 0, 0, width, height);
    annotations.forEach((annotation) => {
        if (annotation.x < crop.x || annotation.x > crop.x + crop.width || annotation.y < crop.y || annotation.y > crop.y + crop.height) return;
        drawAnnotation(context, annotation, image.width, image.height, sourceX, sourceY);
    });
    return canvas.toDataURL("image/png");
}

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("图片读取失败"));
        image.src = src;
    });
}

function sameCrop(a: CropRect, b: CropRect) {
    return Math.abs(a.x - b.x) < 0.0001 && Math.abs(a.y - b.y) < 0.0001 && Math.abs(a.width - b.width) < 0.0001 && Math.abs(a.height - b.height) < 0.0001;
}

function sameAnnotations(a: TextAnnotation[], b: TextAnnotation[]) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}
