import type { AiTextMessage } from "@/services/api/image";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { seedanceReferenceLabel } from "@/lib/seedance-video";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";
import { hasCanvasReferenceToken } from "../utils/canvas-resource-mention-tokens";
import { getGenerationResourceNodes } from "../utils/canvas-resource-references";

export type NodeGenerationContext = {
    prompt: string;
    referenceImages: ReferenceImage[];
    referenceVideos: ReferenceVideo[];
    referenceAudios: ReferenceAudio[];
    textCount: number;
    imageCount: number;
    videoCount: number;
    audioCount: number;
};

export type NodeGenerationInput = {
    nodeId: string;
    type: "text" | "image" | "video" | "audio";
    title: string;
    text?: string;
    image?: ReferenceImage;
    video?: ReferenceVideo;
    audio?: ReferenceAudio;
};

export function buildNodeGenerationContext(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], prompt: string): NodeGenerationContext {
    const inputs = buildNodeGenerationInputs(nodeId, nodes, connections);
    const sourceNode = nodes.find((node) => node.id === nodeId);
    if ((sourceNode?.type === CanvasNodeType.Config && Boolean(sourceNode.metadata?.composerContent?.trim())) || hasCanvasReferenceToken(prompt)) {
        const sourceInput = sourceNode ? generationInputFromNode(sourceNode) : null;
        const composerInputs = sourceInput && !inputs.some((input) => input.nodeId === sourceInput.nodeId) ? [sourceInput, ...inputs] : inputs;
        return buildComposerGenerationContext(composerInputs, prompt);
    }

    const upstreamText = inputs
        .map((input) => input.text)
        .filter(Boolean)
        .join("\n\n");
    const referenceImages = inputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = inputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = inputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    return {
        prompt: upstreamText ? `${prompt}\n\n${upstreamText}` : prompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

function buildComposerGenerationContext(inputs: NodeGenerationInput[], prompt: string): NodeGenerationContext {
    const availableInputs = inputs.filter((input, index) => inputs.findIndex((candidate) => candidate.nodeId === input.nodeId) === index);
    const inputByNodeId = new Map(availableInputs.map((input) => [input.nodeId, input]));
    const labelByNodeId = new Map<string, string>();
    const textBlocks: string[] = [];
    const counts = { image: 0, video: 0, audio: 0, text: 0 };
    availableInputs.forEach((input) => {
        const label = generationLabel(input.type, counts[input.type]++);
        labelByNodeId.set(input.nodeId, label);
        if (input.type === "text") textBlocks.push(`【${label}】\n${input.text || ""}`);
    });

    let nextPrompt = prompt
        .replace(/@\[node:([^;\]]+)(?:;role:(?:target|reference|subject|style|composition))?\]/g, (_token, nodeId: string) => {
            const input = inputByNodeId.get(nodeId);
            const label = labelByNodeId.get(nodeId);
            if (!input || !label) return "";
            return input.type === "text" ? `【${label}】` : label;
        })
        .replace(/@\[exclude:[^\]]+\]/g, "")
        .trim();

    if (textBlocks.length) nextPrompt = `${nextPrompt}\n\n${textBlocks.join("\n\n")}`.trim();

    const referenceImages = availableInputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = availableInputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = availableInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    return {
        prompt: nextPrompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: counts.text,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

export function buildNodeGenerationInputs(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): NodeGenerationInput[] {
    return getGenerationResourceNodes(nodeId, nodes, connections).flatMap((node): NodeGenerationInput[] => {
        const input = generationInputFromNode(node);
        return input ? [input] : [];
    });
}

function generationInputFromNode(node: CanvasNodeData): NodeGenerationInput | null {
    const image = readReferenceImage(node);
    if (image) return { nodeId: node.id, type: "image", title: node.title, image };
    const video = readReferenceVideo(node);
    if (video) return { nodeId: node.id, type: "video", title: node.title, video };
    const audio = readReferenceAudio(node);
    if (audio) return { nodeId: node.id, type: "audio", title: node.title, audio };
    const text = readNodeTextInput(node);
    if (text) return { nodeId: node.id, type: "text", title: node.title, text };
    return null;
}

export function buildNodeResponseMessages(context: NodeGenerationContext): AiTextMessage[] {
    if (!context.referenceImages.length) {
        return [{ role: "user", content: context.prompt }];
    }

    return [
        {
            role: "user",
            content: [{ type: "text" as const, text: context.prompt }, ...context.referenceImages.map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } }))],
        },
    ];
}

export async function hydrateNodeGenerationContext(context: NodeGenerationContext) {
    const { imageToDataUrl } = await import("@/services/image-storage");
    return { ...context, referenceImages: await Promise.all(context.referenceImages.map(async (image) => ({ ...image, dataUrl: await imageToDataUrl(image) }))) };
}

function readNodeTextInput(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    return node.metadata?.prompt || "";
}

function generationLabel(type: NodeGenerationInput["type"], index: number) {
    if (type === "image") return imageReferenceLabel(index);
    if (type === "video") return seedanceReferenceLabel("video", index);
    if (type === "audio") return seedanceReferenceLabel("audio", index);
    return `文本${index + 1}`;
}

function readReferenceImage(node: CanvasNodeData): ReferenceImage | null {
    if (node.type !== CanvasNodeType.Image || !node.metadata?.content) return null;
    const content = node.metadata.content;
    const remoteUrl = isRemoteGeneratedUrl(node.metadata.remoteUrl || "") ? node.metadata.remoteUrl || "" : isRemoteGeneratedUrl(content) ? content : "";
    const serverUrl = isServerGeneratedUrl(node.metadata.serverUrl || "") ? node.metadata.serverUrl || "" : isServerGeneratedUrl(content) ? content : "";
    return {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: content,
        storageKey: node.metadata.storageKey,
        url: remoteUrl || serverUrl || undefined,
    };
}

function isRemoteGeneratedUrl(value: string) {
    return /^https?:\/\//i.test(value);
}

function isServerGeneratedUrl(value: string) {
    return value.startsWith("/api/generation-log-assets/");
}

function readReferenceVideo(node: CanvasNodeData): ReferenceVideo | null {
    if (node.type !== CanvasNodeType.Video || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp4`,
        type: node.metadata.mimeType || "video/mp4",
        url: node.metadata.content,
        storageKey: node.metadata.storageKey,
        bytes: node.metadata.bytes,
        width: node.metadata.naturalWidth,
        height: node.metadata.naturalHeight,
        durationMs: node.metadata.durationMs,
    };
}

function readReferenceAudio(node: CanvasNodeData): ReferenceAudio | null {
    if (node.type !== CanvasNodeType.Audio || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp3`,
        type: node.metadata.mimeType || "audio/mpeg",
        url: node.metadata.content,
        storageKey: node.metadata.storageKey,
        durationMs: node.metadata.durationMs,
    };
}
