"use client";

import { forwardRef, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Check, FileText, Image as ImageIcon, Music2, Video, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasInlineReferenceComposer } from "./canvas-inline-reference-composer";
import { composeCanvasReferenceValue, parseCanvasReferenceNodeIds, stripCanvasReferenceTokens } from "../utils/canvas-resource-mention-tokens";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

type MentionState = {
    start: number;
    query: string;
};

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
    value: string;
    references: CanvasResourceReference[];
    onChange: (value: string) => void;
    onSubmit?: () => void;
    containerClassName?: string;
    inlineReferences?: boolean;
    targetNodeId?: string;
    onDisconnectReference?: (nodeId: string) => void;
};

export const CanvasResourceMentionTextarea = forwardRef<HTMLTextAreaElement, Props>(function CanvasResourceMentionTextarea(
    { value, references, onChange, onSubmit, onKeyDown, className, containerClassName, style, inlineReferences, targetNodeId, onDisconnectReference, ...props },
    forwardedRef,
) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [mention, setMention] = useState<MentionState | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const selectedNodeIds = useMemo(() => parseCanvasReferenceNodeIds(value), [value]);
    const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
    const selectedReferences = useMemo(
        () => selectedNodeIds.map((nodeId) => references.find((item) => item.nodeId === nodeId)).filter((item): item is CanvasResourceReference => Boolean(item)),
        [references, selectedNodeIds],
    );
    const visibleValue = useMemo(() => stripCanvasReferenceTokens(value), [value]);
    const candidates = useMemo(() => {
        if (!mention) return [];
        const query = mention.query.trim().toLowerCase();
        const activeReferences = references.filter((item) => item.active);
        if (!query) return activeReferences;
        return activeReferences.filter((item) => `${item.label} ${item.title} ${item.kind} ${item.text || ""}`.toLowerCase().includes(query));
    }, [mention, references]);
    const updateValue = (next: string, selectionStart?: number) => {
        onChange(next);
        if (typeof selectionStart !== "number") return;
        requestAnimationFrame(() => {
            textareaRef.current?.focus();
            textareaRef.current?.setSelectionRange(selectionStart, selectionStart);
        });
    };

    const closeMention = () => {
        setMention(null);
        setActiveIndex(0);
    };

    const syncMention = (nextValue: string, cursor: number) => {
        const prefix = nextValue.slice(0, cursor);
        const match = /(^|\s)@([^\s@]*)$/.exec(prefix);
        if (!match || !references.some((item) => item.active)) {
            closeMention();
            return;
        }
        setMention({ start: cursor - match[2].length - 1, query: match[2] });
        setActiveIndex(0);
    };

    const insertReference = (reference: CanvasResourceReference) => {
        if (!mention) return;
        const textarea = textareaRef.current;
        const end = textarea?.selectionStart ?? visibleValue.length;
        const nextVisibleValue = `${visibleValue.slice(0, mention.start)}${visibleValue.slice(end)}`;
        const nextNodeIds = selectedNodeIdSet.has(reference.nodeId) ? selectedNodeIds : [...selectedNodeIds, reference.nodeId];
        closeMention();
        updateValue(composeCanvasReferenceValue(nextNodeIds, nextVisibleValue), mention.start);
    };

    const removeReference = (nodeId: string) => {
        const selectionStart = textareaRef.current?.selectionStart ?? visibleValue.length;
        updateValue(
            composeCanvasReferenceValue(
                selectedNodeIds.filter((item) => item !== nodeId),
                visibleValue,
            ),
            selectionStart,
        );
    };

    const menu = mention && candidates.length && textareaRef.current ? (
        <MentionMenu
            textarea={textareaRef.current}
            references={candidates}
            selectedNodeIds={selectedNodeIdSet}
            activeIndex={Math.min(activeIndex, candidates.length - 1)}
            theme={theme}
            onSelect={insertReference}
        />
    ) : null;

    if (inlineReferences) {
        return (
            <CanvasInlineReferenceComposer
                value={value}
                references={references}
                onChange={onChange}
                onSubmit={onSubmit}
                className={className}
                containerClassName={containerClassName}
                style={style}
                placeholder={typeof props.placeholder === "string" ? props.placeholder : undefined}
                targetNodeId={targetNodeId}
                onDisconnectReference={onDisconnectReference}
            />
        );
    }

    return (
        <div className={`flex h-full min-h-0 w-full flex-col ${containerClassName || ""}`}>
            {selectedReferences.length ? (
                <div className="thin-scrollbar mb-2 flex max-w-full shrink-0 gap-2 overflow-x-auto pb-0.5" aria-label="已选择的参考节点">
                    {selectedReferences.map((reference) => (
                        <SelectedReferenceChip key={reference.nodeId} reference={reference} theme={theme} onRemove={() => removeReference(reference.nodeId)} />
                    ))}
                </div>
            ) : null}
            <div className="relative min-h-0 flex-1">
                <textarea
                    {...props}
                    ref={(node) => {
                        textareaRef.current = node;
                        if (typeof forwardedRef === "function") forwardedRef(node);
                        else if (forwardedRef) forwardedRef.current = node;
                    }}
                    value={visibleValue}
                    className={className}
                    style={{ ...style, caretColor: style?.color || theme.node.text }}
                    onChange={(event) => {
                        const next = event.target.value;
                        onChange(composeCanvasReferenceValue(selectedNodeIds, next));
                        syncMention(next, event.target.selectionStart);
                    }}
                    onKeyDown={(event) => {
                        if (mention && candidates.length) {
                            if (event.key === "ArrowDown") {
                                event.preventDefault();
                                setActiveIndex((index) => (index + 1) % candidates.length);
                                return;
                            }
                            if (event.key === "ArrowUp") {
                                event.preventDefault();
                                setActiveIndex((index) => (index - 1 + candidates.length) % candidates.length);
                                return;
                            }
                            if (event.key === "Enter") {
                                event.preventDefault();
                                insertReference(candidates[Math.min(activeIndex, candidates.length - 1)]);
                                return;
                            }
                            if (event.key === "Escape") {
                                event.preventDefault();
                                closeMention();
                                return;
                            }
                        }
                        if (event.key === "Enter" && onSubmit && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                            event.preventDefault();
                            onSubmit();
                            return;
                        }
                        onKeyDown?.(event);
                    }}
                    onBlur={(event) => {
                        window.setTimeout(closeMention, 120);
                        props.onBlur?.(event);
                    }}
                />
                {menu}
            </div>
        </div>
    );
});

function MentionMenu({
    textarea,
    references,
    selectedNodeIds,
    activeIndex,
    theme,
    onSelect,
}: {
    textarea: HTMLTextAreaElement;
    references: CanvasResourceReference[];
    selectedNodeIds: Set<string>;
    activeIndex: number;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onSelect: (reference: CanvasResourceReference) => void;
}) {
    const selectedRef = useRef(false);
    const rect = textarea.getBoundingClientRect();
    const boundary = textarea.closest(".ant-modal-content")?.getBoundingClientRect() || { left: 8, top: 8, right: window.innerWidth - 8, bottom: window.innerHeight - 8 };
    const menuWidth = Math.min(320, Math.max(240, boundary.right - boundary.left - 16));
    const maxMenuHeight = 288;
    const gap = 6;
    const left = clamp(rect.left, boundary.left + 8, boundary.right - menuWidth - 8);
    const showAbove = rect.bottom + gap + maxMenuHeight > boundary.bottom && rect.top - gap - maxMenuHeight >= boundary.top;
    const top = clamp(showAbove ? rect.top - gap - maxMenuHeight : rect.bottom + gap, boundary.top + 8, boundary.bottom - maxMenuHeight - 8);

    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => {
        event.stopPropagation();
    };
    const selectReference = (reference: CanvasResourceReference) => {
        if (selectedRef.current) return;
        selectedRef.current = true;
        onSelect(reference);
    };

    return createPortal(
        <div
            data-canvas-resource-mention-menu="true"
            className="fixed z-[120] max-h-72 overflow-y-auto rounded-lg border p-1.5 shadow-2xl backdrop-blur-md"
            style={{ left, top, width: menuWidth, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={stopCanvasInteraction}
            onMouseDown={stopCanvasInteraction}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="flex items-center justify-between px-2 pb-1 pt-0.5 text-[11px] font-medium opacity-60">
                <span>已连接节点</span>
                <span>{references.length}</span>
            </div>
            {references.map((reference, index) => (
                <button
                    key={reference.id}
                    type="button"
                    className="flex min-h-12 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition"
                    style={{ background: index === activeIndex ? theme.toolbar.activeBg : "transparent", color: index === activeIndex ? theme.toolbar.activeText : theme.node.text }}
                    onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                >
                    <ReferencePreview reference={reference} />
                    <span className="min-w-0 flex-1">
                        <span className="block font-medium">{reference.label}</span>
                        <span className="block truncate opacity-65">{reference.text || reference.title}</span>
                    </span>
                    {selectedNodeIds.has(reference.nodeId) ? <Check className="size-4 shrink-0 text-[#2f80ff]" /> : null}
                </button>
            ))}
        </div>,
        document.body,
    );
}

function SelectedReferenceChip({
    reference,
    theme,
    onRemove,
}: {
    reference: CanvasResourceReference;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onRemove: () => void;
}) {
    return (
        <span className="flex h-10 max-w-44 shrink-0 items-center gap-1.5 rounded-md border p-1 pr-0.5 text-xs" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}>
            <ReferencePreview reference={reference} compact />
            <span className="min-w-0 flex-1 truncate font-medium">{reference.label}</span>
            <button
                type="button"
                className="grid size-8 shrink-0 place-items-center rounded-md opacity-55 transition hover:bg-black/10 hover:opacity-100"
                aria-label={`移除${reference.label}`}
                title={`移除${reference.label}`}
                onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onRemove();
                }}
            >
                <X className="size-3.5" />
            </button>
        </span>
    );
}

function ReferencePreview({ reference, compact = false }: { reference: CanvasResourceReference; compact?: boolean }) {
    const size = compact ? "size-8" : "size-10";
    if (reference.kind === "image" && reference.previewUrl) return <img src={reference.previewUrl} alt="" className={`${size} rounded object-cover`} />;
    if (reference.kind === "video" && reference.previewUrl) return <video src={reference.previewUrl} className={`${size} rounded bg-black object-cover`} muted preload="metadata" />;
    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
    return (
        <span className={`grid ${size} shrink-0 place-items-center rounded bg-black/10`}>
            <Icon className="size-4" />
        </span>
    );
}

function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}
