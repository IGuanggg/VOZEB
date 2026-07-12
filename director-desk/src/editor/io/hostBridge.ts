import { useDirectorStore } from "../store/directorStore";
import type { DirectorProject } from "../schema/directorProject";

interface HostPanoramaPayload {
  edgeId?: unknown;
  sourceNodeId?: unknown;
  imageUrl?: unknown;
  fileName?: unknown;
  nonce?: unknown;
}

interface HostSessionPayload {
  instanceId?: unknown;
  theme?: unknown;
  project?: unknown;
  nonce?: unknown;
}

export interface HostCaptureItemPayload {
  dataUrl?: unknown;
  fileName?: unknown;
}

export interface HostCaptureBatchPayload {
  captures?: HostCaptureItemPayload[];
}

export interface DirectorDeskCaptureDelivery {
  requestId: string;
  status: "accepted" | "failed";
  error?: string;
}

interface HostConnectedPanorama {
  edgeId: string;
  sourceNodeId: string;
}

let initialized = false;
let hostConnectedPanorama: HostConnectedPanorama | null = null;
let removeUnsubscribe: (() => void) | null = null;
let suppressNextPanoramaRemovalNotice = false;
let hostSessionNonce = "";
let projectChangeTimer: ReturnType<typeof setTimeout> | null = null;
let captureRequestSequence = 0;
const captureDeliveryListeners = new Set<(delivery: DirectorDeskCaptureDelivery) => void>();

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getHostOrigin() {
  try {
    const value = new URLSearchParams(window.location.search).get("hostOrigin")?.trim();
    return value && /^https?:\/\//.test(value) ? value : window.location.origin;
  } catch {
    return window.location.origin;
  }
}

function postToHost(type: string, payload: Record<string, unknown> = {}, requireSession = true) {
  if (requireSession && !hostSessionNonce) return;
  window.parent?.postMessage(
    {
      type,
      payload: requireSession ? { ...payload, nonce: hostSessionNonce } : payload,
    },
    getHostOrigin()
  );
}

function isDirectorProject(value: unknown): value is DirectorProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<DirectorProject>;
  return project.version === 1 && Boolean(project.scene) && Array.isArray(project.assets) && Array.isArray(project.objects) && Array.isArray(project.cameras);
}

function hostProjectSnapshot(project: DirectorProject): DirectorProject {
  const connectedPanoramaAssetId = hostConnectedPanorama ? project.panoramaAssetId : null;
  return {
    ...project,
    assets: connectedPanoramaAssetId ? project.assets.filter((asset) => asset.id !== connectedPanoramaAssetId) : project.assets,
    panoramaAssetId: connectedPanoramaAssetId ? null : project.panoramaAssetId,
    cameras: project.cameras.map((camera) => ({ ...camera, lastCaptureUrl: null, captures: [] })),
  };
}

function scheduleProjectChanged(project: DirectorProject) {
  if (!hostSessionNonce) return;
  if (projectChangeTimer) clearTimeout(projectChangeTimer);
  projectChangeTimer = setTimeout(() => {
    postToHost("storyai:director-desk-project-changed", { project: hostProjectSnapshot(project) });
    projectChangeTimer = null;
  }, 500);
}

function normalizeTheme(value: unknown): "dark" | "light" | null {
  return value === "light" || value === "dark" ? value : null;
}

function applyDirectorDeskTheme(theme: "dark" | "light") {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function getInitialHostTheme() {
  try {
    return normalizeTheme(new URLSearchParams(window.location.search).get("theme"));
  } catch {
    return null;
  }
}

function notifyPanoramaRemoved() {
  if (!hostConnectedPanorama) {
    return;
  }

  postToHost("storyai:director-desk-panorama-removed", { ...hostConnectedPanorama });
  hostConnectedPanorama = null;
}

function subscribeToPanoramaRemoval() {
  if (removeUnsubscribe) {
    return;
  }

  let previousPanoramaAssetId = useDirectorStore.getState().project.panoramaAssetId;
  let previousProject = useDirectorStore.getState().project;
  removeUnsubscribe = useDirectorStore.subscribe((state) => {
    const nextPanoramaAssetId = state.project.panoramaAssetId;

    if (previousPanoramaAssetId && !nextPanoramaAssetId) {
      if (suppressNextPanoramaRemovalNotice) {
        suppressNextPanoramaRemovalNotice = false;
        hostConnectedPanorama = null;
      } else {
        notifyPanoramaRemoved();
      }
    }

    previousPanoramaAssetId = nextPanoramaAssetId;
    if (state.project !== previousProject) {
      previousProject = state.project;
      scheduleProjectChanged(state.project);
    }
  });
}

function importHostPanorama(payload: HostPanoramaPayload) {
  const imageUrl = normalizeString(payload.imageUrl);
  if (!imageUrl) {
    return;
  }

  const fileName = normalizeString(payload.fileName) || "画布全景图.png";
  const edgeId = normalizeString(payload.edgeId);
  const sourceNodeId = normalizeString(payload.sourceNodeId);

  if (hostConnectedPanorama && useDirectorStore.getState().project.panoramaAssetId) {
    suppressNextPanoramaRemovalNotice = true;
    useDirectorStore.getState().removeImportedAsset(useDirectorStore.getState().project.panoramaAssetId!);
  }
  hostConnectedPanorama = edgeId && sourceNodeId ? { edgeId, sourceNodeId } : null;
  useDirectorStore.getState().addImportedAsset({
    kind: "panorama",
    name: fileName,
    fileName,
    url: imageUrl,
    projectionMode: "backdrop",
  });
}

function clearHostPanorama() {
  const panoramaAssetId = useDirectorStore.getState().project.panoramaAssetId;
  if (!hostConnectedPanorama || !panoramaAssetId) return;
  suppressNextPanoramaRemovalNotice = true;
  useDirectorStore.getState().removeImportedAsset(panoramaAssetId);
  hostConnectedPanorama = null;
}

function openHostSession(payload: HostSessionPayload) {
  const instanceId = normalizeString(payload.instanceId);
  const theme = normalizeTheme(payload.theme);
  const nonce = normalizeString(payload.nonce);
  if (!nonce) return;
  hostSessionNonce = nonce;
  if (theme) {
    applyDirectorDeskTheme(theme);
  }
  suppressNextPanoramaRemovalNotice = Boolean(useDirectorStore.getState().project.panoramaAssetId);
  useDirectorStore.getState().openScopedScene(instanceId || null);
  if (isDirectorProject(payload.project)) useDirectorStore.getState().replaceProject(payload.project);
  suppressNextPanoramaRemovalNotice = false;
  hostConnectedPanorama = null;
}

export function postDirectorDeskCapturesToHost(
  captures: Array<{
    dataUrl: string;
    fileName?: string;
  }>
): string | null {
  const normalizedCaptures = captures
    .map((capture, index) => {
      const dataUrl = normalizeString(capture.dataUrl);
      if (!dataUrl) {
        return null;
      }

      return {
        dataUrl,
        fileName: normalizeString(capture.fileName) || `director-desk-capture-${index + 1}.png`,
      };
    })
    .filter((capture): capture is { dataUrl: string; fileName: string } => Boolean(capture));

  if (normalizedCaptures.length === 0) {
    return null;
  }

  const requestId = `capture-${Date.now()}-${++captureRequestSequence}`;
  postToHost("storyai:director-desk-captures-sent", { requestId, captures: normalizedCaptures.slice(0, 12) });
  return requestId;
}

export function subscribeToDirectorDeskCaptureDelivery(listener: (delivery: DirectorDeskCaptureDelivery) => void) {
  captureDeliveryListeners.add(listener);
  return () => {
    captureDeliveryListeners.delete(listener);
  };
}

export function postDirectorDeskReadyToHost() {
  postToHost("storyai:director-desk-ready", {}, false);
}

export function postDirectorDeskCloseToHost() {
  postToHost("storyai:director-desk-close");
}

function handleHostMessage(event: MessageEvent) {
  if (event.source !== window.parent || event.origin !== getHostOrigin()) {
    return;
  }

  if (event.data?.type === "storyai:director-desk-session") {
    openHostSession((event.data.payload || {}) as HostSessionPayload);
    return;
  }

  if (event.data?.payload?.nonce !== hostSessionNonce) return;

  if (event.data?.type === "storyai:director-desk-panorama") {
    importHostPanorama((event.data.payload || {}) as HostPanoramaPayload);
    return;
  }

  if (event.data?.type === "storyai:director-desk-captures-accepted" || event.data?.type === "storyai:director-desk-captures-failed") {
    const requestId = normalizeString(event.data?.payload?.requestId);
    if (!requestId) return;
    const status = event.data.type === "storyai:director-desk-captures-accepted" ? "accepted" : "failed";
    const error = normalizeString(event.data?.payload?.error) || undefined;
    captureDeliveryListeners.forEach((listener) => listener({ requestId, status, error }));
    return;
  }

  if (event.data?.type === "storyai:director-desk-panorama-clear") clearHostPanorama();
}

export function initDirectorDeskHostBridge() {
  if (initialized) {
    return;
  }

  initialized = true;
  applyDirectorDeskTheme(getInitialHostTheme() ?? "dark");
  window.addEventListener("message", handleHostMessage);
  subscribeToPanoramaRemoval();
}

export function clearDirectorDeskHostBridge() {
  if (!initialized) {
    return;
  }

  initialized = false;
  hostConnectedPanorama = null;
  suppressNextPanoramaRemovalNotice = false;
  hostSessionNonce = "";
  captureDeliveryListeners.clear();
  if (projectChangeTimer) clearTimeout(projectChangeTimer);
  projectChangeTimer = null;
  window.removeEventListener("message", handleHostMessage);
  removeUnsubscribe?.();
  removeUnsubscribe = null;
}
