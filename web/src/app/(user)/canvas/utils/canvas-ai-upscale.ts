"use client";

export type AiUpscaleFactor = 2 | 4;

export const MAX_AI_UPSCALE_OUTPUT_PIXELS = 32_000_000;
const AI_UPSCALE_TIMEOUT_MS = 45_000;

type AiUpscaleOptions = {
    factor: AiUpscaleFactor;
    signal?: AbortSignal;
    onProgress?: (progress: number) => void;
};

let aiUpscaleQueue: Promise<void> = Promise.resolve();

export async function aiUpscaleDataUrl(dataUrl: string, options: AiUpscaleOptions) {
    const previous = aiUpscaleQueue;
    let releaseQueue: () => void = () => undefined;
    const queueSlot = new Promise<void>((resolve) => {
        releaseQueue = resolve;
    });
    aiUpscaleQueue = previous.then(
        () => queueSlot,
        () => queueSlot,
    );

    try {
        await waitForQueue(previous, options.signal);
        return await runAiUpscaleDataUrl(dataUrl, options);
    } finally {
        releaseQueue();
    }
}

function waitForQueue(previous: Promise<void>, signal?: AbortSignal) {
    if (!signal) return previous;
    if (signal.aborted) return Promise.reject(new DOMException("AI 超清已取消", "AbortError"));

    return new Promise<void>((resolve, reject) => {
        const abort = () => {
            cleanup();
            reject(new DOMException("AI 超清已取消", "AbortError"));
        };
        const cleanup = () => signal.removeEventListener("abort", abort);
        signal.addEventListener("abort", abort, { once: true });
        previous.then(
            () => {
                cleanup();
                resolve();
            },
            (error) => {
                cleanup();
                reject(error);
            },
        );
    });
}

async function runAiUpscaleDataUrl(dataUrl: string, { factor, signal, onProgress }: AiUpscaleOptions) {
    if (typeof window === "undefined") throw new Error("AI 超清只能在浏览器中运行");
    if (signal?.aborted) throw new DOMException("AI 超清已取消", "AbortError");

    onProgress?.(0.01);
    const [{ default: Upscaler }, tf, modelModule] = await Promise.all([import("upscaler"), import("@tensorflow/tfjs"), factor === 4 ? import("@upscalerjs/esrgan-slim/4x") : import("@upscalerjs/esrgan-slim/2x")]);
    if (signal?.aborted) throw new DOMException("AI 超清已取消", "AbortError");
    onProgress?.(0.04);

    try {
        const webglReady = await tf.setBackend("webgl");
        if (!webglReady) await tf.setBackend("cpu");
    } catch {
        await tf.setBackend("cpu");
    }
    await tf.ready();
    onProgress?.(0.08);

    const upscaler = new Upscaler({ model: { ...modelModule.default, path: `/ai-models/esrgan-slim/x${factor}/model.json` } });
    const timeoutController = new AbortController();
    const abortFromParent = () => timeoutController.abort(signal?.reason);
    signal?.addEventListener("abort", abortFromParent, { once: true });
    const timeout = window.setTimeout(() => timeoutController.abort(new DOMException("本地 AI 处理超时", "TimeoutError")), AI_UPSCALE_TIMEOUT_MS);
    try {
        const result = await upscaler.upscale(dataUrl, {
            patchSize: factor === 2 ? 96 : 64,
            padding: 2,
            awaitNextFrame: true,
            signal: timeoutController.signal,
            progress: (amount) => onProgress?.(0.08 + Math.max(0, Math.min(1, amount)) * 0.92),
        });
        onProgress?.(1);
        return result;
    } catch (error) {
        if (!signal?.aborted && timeoutController.signal.aborted) throw new Error("本地 AI 处理超时，已切换兼容模式");
        throw error;
    } finally {
        window.clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromParent);
        await upscaler.dispose();
    }
}
