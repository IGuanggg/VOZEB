"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Segmented } from "antd";
import { Sparkles } from "lucide-react";

import { readImageMeta } from "@/lib/image-utils";
import { MAX_AI_UPSCALE_OUTPUT_PIXELS, type AiUpscaleFactor } from "../utils/canvas-ai-upscale";

export type CanvasImageSuperResolveParams = {
    factor: AiUpscaleFactor;
};

export function CanvasNodeSuperResolveDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageSuperResolveParams) => void }) {
    const [factor, setFactor] = useState<AiUpscaleFactor>(2);
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const [imageError, setImageError] = useState(false);
    const outputSize = useMemo(() => (image ? { width: image.width * factor, height: image.height * factor } : null), [factor, image]);
    const outputPixels = outputSize ? outputSize.width * outputSize.height : 0;
    const isTooLarge = outputPixels > MAX_AI_UPSCALE_OUTPUT_PIXELS;

    useEffect(() => {
        if (!open) return;
        setFactor(2);
        setImage(null);
        setImageError(false);
        void readImageMeta(dataUrl)
            .then(setImage)
            .catch(() => setImageError(true));
    }, [dataUrl, open]);

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={760} centered destroyOnHidden>
            <div className="space-y-5">
                <div>
                    <h2 className="text-xl font-semibold">AI 超清</h2>
                    <p className="mt-1 text-sm opacity-60">在当前设备本地增强细节，原图会保留。</p>
                </div>
                <div className="grid gap-6 md:grid-cols-[minmax(240px,1fr)_320px]">
                    <div className="rounded-lg border p-4">
                        <div className="grid min-h-[260px] place-items-center rounded-md bg-black/5">
                            <img src={dataUrl} alt="" className="max-h-[300px] max-w-full rounded-md object-contain shadow-lg" draggable={false} />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                            <span className="opacity-60">源图</span>
                            <span className="font-semibold">{image ? `${image.width} x ${image.height} px` : "读取中"}</span>
                        </div>
                    </div>
                    <div className="space-y-5 py-2">
                        <div className="space-y-2">
                            <div className="font-medium opacity-75">增强倍数</div>
                            <Segmented
                                block
                                value={factor}
                                options={[
                                    { label: "2x · 推荐", value: 2 },
                                    { label: "4x · 更清晰", value: 4 },
                                ]}
                                onChange={(value) => setFactor(Number(value) as AiUpscaleFactor)}
                            />
                        </div>
                        <div className="rounded-lg border px-4 py-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="opacity-60">输出尺寸</span>
                                <span className="font-semibold">{outputSize ? `${outputSize.width} x ${outputSize.height} px` : "未知"}</span>
                            </div>
                        </div>
                        <Alert type={imageError || isTooLarge ? "warning" : "info"} showIcon message={imageError ? "无法读取源图，请重新上传后再试。" : isTooLarge ? "输出尺寸过大，请改用 2x" : "首次使用会加载 AI 模型，处理期间可继续浏览画布。"} />
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button type="primary" size="large" icon={<Sparkles className="size-4" />} disabled={!image || imageError || isTooLarge} onClick={() => onConfirm({ factor })}>
                        开始 AI 超清
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
