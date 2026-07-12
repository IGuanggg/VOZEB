export type CanvasReferenceRole = "target" | "reference" | "subject" | "style" | "composition";

export type CanvasReferenceToken = {
    nodeId: string;
    role: CanvasReferenceRole;
};

const REFERENCE_TOKEN_SOURCE = "@\\[node:([^;\\]]+)(?:;role:(target|reference|subject|style|composition))?\\]";
const EXCLUDED_REFERENCE_TOKEN_SOURCE = "@\\[exclude:([^\\]]+)\\]";

export const CANVAS_REFERENCE_TOKEN_PATTERN = new RegExp(REFERENCE_TOKEN_SOURCE, "g");

export function parseCanvasReferenceTokens(value: string): CanvasReferenceToken[] {
    return Array.from(value.matchAll(new RegExp(REFERENCE_TOKEN_SOURCE, "g")), (match) => ({
        nodeId: match[1],
        role: (match[2] as CanvasReferenceRole | undefined) || "reference",
    }));
}

export function parseCanvasReferenceNodeIds(value: string) {
    const nodeIds = parseCanvasReferenceTokens(value).map((token) => token.nodeId);
    return nodeIds.filter((nodeId, index) => nodeIds.indexOf(nodeId) === index);
}

export function parseExcludedCanvasReferenceNodeIds(value: string) {
    const nodeIds = Array.from(value.matchAll(new RegExp(EXCLUDED_REFERENCE_TOKEN_SOURCE, "g")), (match) => match[1]);
    return nodeIds.filter((nodeId, index) => nodeIds.indexOf(nodeId) === index);
}

export function stripCanvasReferenceTokens(value: string) {
    return value.replace(new RegExp(REFERENCE_TOKEN_SOURCE, "g"), "").replace(new RegExp(EXCLUDED_REFERENCE_TOKEN_SOURCE, "g"), "").replace(/^[ \t]*\n/, "");
}

export function composeCanvasReferenceValue(nodeIds: string[], visibleValue: string) {
    const uniqueNodeIds = nodeIds.filter((nodeId, index) => nodeId && nodeIds.indexOf(nodeId) === index);
    const tokens = uniqueNodeIds.map((nodeId) => `@[node:${nodeId}]`).join(" ");
    return tokens ? `${tokens}${visibleValue ? `\n${visibleValue}` : ""}` : visibleValue;
}

export function hasCanvasReferenceToken(value: string) {
    return new RegExp(REFERENCE_TOKEN_SOURCE).test(value) || new RegExp(EXCLUDED_REFERENCE_TOKEN_SOURCE).test(value);
}

export function canvasReferenceToken(nodeId: string, role: CanvasReferenceRole = "reference") {
    return `@[node:${nodeId};role:${role}]`;
}

export function excludedCanvasReferenceToken(nodeId: string) {
    return `@[exclude:${nodeId}]`;
}

export function canvasReferenceRoleLabel(role: CanvasReferenceRole) {
    if (role === "target") return "修改";
    if (role === "subject") return "主体";
    if (role === "style") return "风格";
    if (role === "composition") return "构图";
    return "参考";
}
