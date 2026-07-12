const REFERENCE_TOKEN_SOURCE = "@\\[node:([^\\]]+)\\]";

export function parseCanvasReferenceNodeIds(value: string) {
    const nodeIds = Array.from(value.matchAll(new RegExp(REFERENCE_TOKEN_SOURCE, "g")), (match) => match[1]);
    return nodeIds.filter((nodeId, index) => nodeIds.indexOf(nodeId) === index);
}

export function stripCanvasReferenceTokens(value: string) {
    return value.replace(new RegExp(REFERENCE_TOKEN_SOURCE, "g"), "").replace(/^[ \t]*\n/, "");
}

export function composeCanvasReferenceValue(nodeIds: string[], visibleValue: string) {
    const uniqueNodeIds = nodeIds.filter((nodeId, index) => nodeId && nodeIds.indexOf(nodeId) === index);
    const tokens = uniqueNodeIds.map((nodeId) => `@[node:${nodeId}]`).join(" ");
    return tokens ? `${tokens}${visibleValue ? `\n${visibleValue}` : ""}` : visibleValue;
}

export function hasCanvasReferenceToken(value: string) {
    return new RegExp(REFERENCE_TOKEN_SOURCE).test(value);
}
