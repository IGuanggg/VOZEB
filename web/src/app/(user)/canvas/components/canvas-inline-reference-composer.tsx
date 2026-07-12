"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { FileText, Image as ImageIcon, Music2, Video, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { canvasReferenceToken } from "../utils/canvas-resource-mention-tokens";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

type Props = {
    value: string;
    references: CanvasResourceReference[];
    onChange: (value: string) => void;
    onSubmit?: () => void;
    className?: string;
    containerClassName?: string;
    style?: CSSProperties;
    placeholder?: string;
    targetNodeId?: string;
    onDisconnectReference?: (nodeId: string) => void;
};

type MentionState = { query: string };

export function CanvasInlineReferenceComposer({ value, references, onChange, onSubmit, className, containerClassName, style, placeholder, targetNodeId, onDisconnectReference }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const editorRef = useRef<HTMLDivElement>(null);
    const composingRef = useRef(false);
    const lastSerializedRef = useRef(value);
    const [mention, setMention] = useState<MentionState | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const activeReferences = useMemo(() => references.filter((reference) => reference.active), [references]);
    const referenceById = useMemo(() => new Map(activeReferences.map((reference) => [reference.nodeId, reference])), [activeReferences]);
    const candidates = useMemo(() => {
        if (!mention) return [];
        const query = mention.query.trim().toLowerCase();
        if (!query) return activeReferences;
        return activeReferences.filter((reference) => `${reference.label} ${reference.title} ${reference.kind} ${reference.text || ""}`.toLowerCase().includes(query));
    }, [activeReferences, mention]);

    const syncFromEditor = () => {
        const editor = editorRef.current;
        if (!editor) return;
        const next = serializeEditor(editor);
        lastSerializedRef.current = next;
        onChange(next);
        syncMention(editor);
    };

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor || (editor.contains(document.activeElement) && value === lastSerializedRef.current)) return;
        editor.textContent = "";
        const tokens = parseEditorTokens(value);
        tokens.forEach((token) => {
            if (token.type === "text") {
                editor.append(document.createTextNode(token.value));
                return;
            }
            if (token.type === "exclude") {
                return;
            }
            const reference = referenceById.get(token.nodeId);
            if (reference) editor.append(createInlineReference(reference, theme));
        });
        lastSerializedRef.current = value;
    }, [referenceById, theme, value]);

    const closeMention = () => {
        setMention(null);
        setActiveIndex(0);
    };

    const insertReference = (reference: CanvasResourceReference) => {
        const editor = editorRef.current;
        if (!editor) return;
        removeActiveMention(editor);
        const chip = createInlineReference(reference, theme);
        insertAtCaret(editor, chip);
        closeMention();
        syncFromEditor();
    };

    const disconnectReference = (nodeId: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.querySelectorAll<HTMLElement>(`[data-reference-node-id="${CSS.escape(nodeId)}"]`).forEach((node) => node.remove());
        syncFromEditor();
        onDisconnectReference?.(nodeId);
    };

    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => event.stopPropagation();

    return (
        <div className={`flex min-h-0 w-full flex-col ${containerClassName || ""}`}>
            {activeReferences.length ? (
                <div className="thin-scrollbar mb-2 flex max-w-full shrink-0 gap-2 overflow-x-auto pb-0.5" aria-label="已连接的参考素材">
                    {activeReferences.map((reference, index) => (
                        <div key={reference.nodeId} className="group relative size-12 shrink-0">
                            <button
                                type="button"
                                className="size-12 overflow-hidden rounded-md border"
                                style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
                                title={`在提示词中插入${reference.label}`}
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    insertReference(reference);
                                }}
                            >
                                <ReferencePreview reference={reference} tile />
                            </button>
                            <span className="pointer-events-none absolute left-1 top-1 grid min-w-4 place-items-center rounded bg-black/65 px-1 text-[10px] font-semibold leading-4 text-white">{index + 1}</span>
                            {onDisconnectReference && reference.nodeId !== targetNodeId ? (
                                <button
                                    type="button"
                                    className="absolute -right-2 -top-2 grid size-11 place-items-center text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100"
                                    aria-label={`断开${reference.label}`}
                                    title={`断开${reference.label}`}
                                    onPointerDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                    }}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        disconnectReference(reference.nodeId);
                                    }}
                                >
                                    <span className="grid size-6 place-items-center rounded-full border border-white/70 bg-[#333] shadow-sm">
                                        <X className="size-3" />
                                    </span>
                                </button>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : null}
            <div className="relative min-h-0 flex-1">
                {!editorVisibleText(value) ? (
                    <div className="pointer-events-none absolute left-3 top-2 z-10 text-sm leading-7" style={{ color: theme.node.placeholder }}>
                        {placeholder}
                    </div>
                ) : null}
                <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-multiline="true"
                    className={className}
                    style={{ ...style, caretColor: style?.color || theme.node.text }}
                    onInput={() => {
                        if (!composingRef.current) syncFromEditor();
                    }}
                    onCompositionStart={() => {
                        composingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                        composingRef.current = false;
                        syncFromEditor();
                    }}
                    onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                        event.stopPropagation();
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
                        if ((event.key === "Backspace" || event.key === "Delete") && deleteAdjacentReference(event.key)) {
                            event.preventDefault();
                            requestAnimationFrame(syncFromEditor);
                            return;
                        }
                        if (event.key === "Enter" && onSubmit && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                            event.preventDefault();
                            onSubmit();
                            return;
                        }
                        requestAnimationFrame(() => syncMention(editorRef.current));
                    }}
                    onBlur={() => window.setTimeout(closeMention, 120)}
                    onMouseDown={stopCanvasInteraction}
                    onPointerDown={stopCanvasInteraction}
                    onWheel={(event) => event.stopPropagation()}
                />
                {mention && candidates.length && editorRef.current ? (
                    <MentionMenu editor={editorRef.current} references={candidates} allReferences={activeReferences} activeIndex={Math.min(activeIndex, candidates.length - 1)} theme={theme} onSelect={insertReference} />
                ) : null}
            </div>
        </div>
    );

    function syncMention(editor: HTMLElement | null) {
        if (!editor) return;
        const text = textBeforeCaret(editor);
        const match = /@([^\s@]*)$/.exec(text);
        if (!match || !activeReferences.length) {
            closeMention();
            return;
        }
        setMention({ query: match[1] || "" });
        setActiveIndex(0);
    }
}

function MentionMenu({ editor, references, allReferences, activeIndex, theme, onSelect }: { editor: HTMLElement; references: CanvasResourceReference[]; allReferences: CanvasResourceReference[]; activeIndex: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onSelect: (reference: CanvasResourceReference) => void }) {
    const selectedRef = useRef(false);
    const rect = editor.getBoundingClientRect();
    const menuWidth = Math.min(320, Math.max(240, window.innerWidth - 24));
    const left = clamp(rect.left, 12, window.innerWidth - menuWidth - 12);
    const showAbove = rect.bottom + 294 > window.innerHeight && rect.top > 294;
    const top = clamp(showAbove ? rect.top - 294 : rect.bottom + 6, 12, window.innerHeight - 288 - 12);
    const selectReference = (reference: CanvasResourceReference) => {
        if (selectedRef.current) return;
        selectedRef.current = true;
        onSelect(reference);
    };

    return createPortal(
        <div className="fixed z-[120] max-h-72 overflow-y-auto rounded-lg border p-1.5 shadow-2xl backdrop-blur-md" style={{ left, top, width: menuWidth, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between px-2 pb-1 pt-0.5 text-[11px] font-medium opacity-60">
                <span>已连接素材</span>
                <span>{references.length}</span>
            </div>
            {references.map((reference, index) => (
                <button
                    key={reference.nodeId}
                    type="button"
                    className="flex min-h-12 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition"
                    style={{ background: index === activeIndex ? theme.toolbar.activeBg : "transparent", color: index === activeIndex ? theme.toolbar.activeText : theme.node.text }}
                    onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                >
                    <ReferencePreview reference={reference} />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{reference.title || reference.label}</span>
                        <span className="block truncate opacity-65">{reference.label}</span>
                    </span>
                    <span className="shrink-0 text-[11px] opacity-55">@{Math.max(1, allReferences.findIndex((item) => item.nodeId === reference.nodeId) + 1)}</span>
                </button>
            ))}
        </div>,
        document.body,
    );
}

function createInlineReference(reference: CanvasResourceReference, theme: (typeof canvasThemes)[keyof typeof canvasThemes]) {
    const wrapper = document.createElement("span");
    wrapper.contentEditable = "false";
    wrapper.dataset.referenceNodeId = reference.nodeId;
    wrapper.className = "mx-0.5 inline-flex h-7 max-w-56 items-center gap-1 overflow-hidden rounded-md border px-1 align-middle text-xs leading-none";
    Object.assign(wrapper.style, { background: theme.toolbar.activeBg, borderColor: theme.node.stroke, color: theme.toolbar.activeText });

    if (reference.kind === "image" && reference.previewUrl) {
        const image = document.createElement("img");
        image.src = reference.previewUrl;
        image.alt = "";
        image.className = "size-5 shrink-0 rounded object-cover";
        wrapper.appendChild(image);
    }

    const label = document.createElement("span");
    label.className = "shrink-0 font-semibold";
    label.textContent = reference.label;
    wrapper.appendChild(label);

    return wrapper;
}

function serializeEditor(editor: HTMLElement) {
    return serializeNodes(editor.childNodes).replace(/\uFEFF/g, "");
}

function serializeNodes(nodes: NodeListOf<ChildNode>) {
    let result = "";
    nodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) result += node.textContent || "";
        if (!(node instanceof HTMLElement)) return;
        const nodeId = node.dataset.referenceNodeId;
        if (nodeId) result += canvasReferenceToken(nodeId);
        else if (node.tagName === "BR") result += "\n";
        else result += serializeNodes(node.childNodes);
    });
    return result;
}

function parseEditorTokens(value: string) {
    const pattern = /@\[node:([^;\]]+)(?:;role:(target|reference|subject|style|composition))?\]|@\[exclude:([^\]]+)\]/g;
    const tokens: Array<{ type: "text"; value: string } | { type: "reference"; nodeId: string } | { type: "exclude"; nodeId: string }> = [];
    let lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
        if (match.index === undefined) continue;
        if (match.index > lastIndex) tokens.push({ type: "text", value: value.slice(lastIndex, match.index) });
        if (match[3]) tokens.push({ type: "exclude", nodeId: match[3] });
        else tokens.push({ type: "reference", nodeId: match[1] });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) tokens.push({ type: "text", value: value.slice(lastIndex) });
    return tokens;
}

function insertAtCaret(editor: HTMLElement, node: HTMLElement) {
    editor.focus();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const space = document.createTextNode(" ");
    if (range && editor.contains(range.startContainer)) {
        range.insertNode(space);
        range.insertNode(node);
        range.setStartAfter(space);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
        return;
    }
    editor.append(node, space);
    placeCaretAtEnd(editor);
}

function removeActiveMention(editor: HTMLElement) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer) || range.startContainer.nodeType !== Node.TEXT_NODE) return;
    const text = textBeforeCaret(editor);
    const match = /@([^\s@]*)$/.exec(text);
    if (!match) return;
    range.setStart(range.startContainer, Math.max(0, range.startOffset - (match[1] || "").length - 1));
    range.deleteContents();
}

function deleteAdjacentReference(key: string) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    const previous = key === "Backspace";
    const container = range.startContainer;
    let candidate: Node | null = null;
    if (container.nodeType === Node.TEXT_NODE) {
        const text = container.textContent || "";
        if ((previous && range.startOffset > 0) || (!previous && range.startOffset < text.length)) return false;
        candidate = previous ? container.previousSibling : container.nextSibling;
    } else {
        candidate = container.childNodes[previous ? range.startOffset - 1 : range.startOffset] || null;
    }
    while (candidate?.nodeType === Node.TEXT_NODE && !(candidate.textContent || "").trim()) candidate = previous ? candidate.previousSibling : candidate.nextSibling;
    if (!(candidate instanceof HTMLElement) || !candidate.dataset.referenceNodeId) return false;
    candidate.remove();
    return true;
}

function textBeforeCaret(editor: HTMLElement) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return "";
    const range = selection.getRangeAt(0).cloneRange();
    if (!editor.contains(range.startContainer)) return "";
    range.setStart(editor, 0);
    return range.toString();
}

function placeCaretAtEnd(element: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

function ReferencePreview({ reference, compact = false, tile = false }: { reference: CanvasResourceReference; compact?: boolean; tile?: boolean }) {
    const size = tile ? "size-full" : compact ? "size-8" : "size-10";
    if (reference.kind === "image" && reference.previewUrl) return <img src={reference.previewUrl} alt="" className={`${size} shrink-0 rounded object-cover`} />;
    if (reference.kind === "video" && reference.previewUrl) return <video src={reference.previewUrl} className={`${size} shrink-0 rounded bg-black object-cover`} muted preload="metadata" />;
    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
    return (
        <span className={`grid ${size} shrink-0 place-items-center rounded bg-black/10`}>
            <Icon className="size-4" />
        </span>
    );
}

function editorVisibleText(value: string) {
    return /@\[node:[^\]]+\]/.test(value) || Boolean(value.replace(/@\[(?:node:[^\]]+|exclude:[^\]]+)\]/g, "").trim());
}

function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}
