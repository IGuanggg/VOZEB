import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SystemChannelAdvancedConfig } from "@/lib/auth/store";
import type { GenerationLogSource } from "@/lib/server/generation-log-store";
import { resolveServerDataPath } from "@/lib/server/data-dir";

export type ImageTaskKind = "generation" | "edit";
export type ImageTaskStatus = "pending" | "running" | "success" | "error";

export type ImageTaskConfig = {
    apiSource?: "system" | "custom";
    baseUrl: string;
    apiKey: string;
    apiFormat: "openai" | "gemini";
    model: string;
    quality?: string;
    size?: string;
    systemPrompt?: string;
    advancedConfig?: SystemChannelAdvancedConfig;
};

export type ImageTaskReference = {
    id?: string;
    name?: string;
    type?: string;
    dataUrl: string;
    url?: string;
    remoteUrl?: string;
    serverUrl?: string;
};

export type ImageTaskExecution = {
    origin: string;
    publicOrigin: string;
    cookie: string;
};

export type ImageTask = {
    id: string;
    userId: string;
    username: string;
    displayName: string;
    kind: ImageTaskKind;
    source: GenerationLogSource;
    title?: string;
    status: ImageTaskStatus;
    createdAt: number;
    updatedAt: number;
    config: ImageTaskConfig;
    prompt: string;
    references: ImageTaskReference[];
    mask?: ImageTaskReference;
    execution?: ImageTaskExecution;
    result?: { dataUrl: string; remoteUrl?: string; serverUrl?: string };
    error?: string;
    pointsRemaining?: number;
};

const TASK_TTL_MS = 60 * 60 * 1000;
const TASK_STALE_MS = 30 * 60 * 1000;
const TASK_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const TASK_DATA_DIR = resolveServerDataPath("image-tasks");
const globalImageTaskStore = globalThis as typeof globalThis & {
    __vozebImageTasks?: Map<string, ImageTask>;
    __vozebImageTaskCleanupTimer?: NodeJS.Timeout;
};
const tasks = (globalImageTaskStore.__vozebImageTasks ??= loadPersistedImageTasks());
globalImageTaskStore.__vozebImageTaskCleanupTimer ??= scheduleImageTaskCleanup();

export function createImageTask(input: Omit<ImageTask, "id" | "status" | "createdAt" | "updatedAt">) {
    cleanupImageTasks();
    const now = Date.now();
    const task: ImageTask = {
        ...input,
        id: randomUUID(),
        status: "pending",
        createdAt: now,
        updatedAt: now,
    };
    tasks.set(task.id, task);
    persistImageTask(task);
    return task;
}

export function getImageTask(id: string) {
    cleanupImageTasks();
    markStaleImageTasks();
    return tasks.get(id) || null;
}

export function countActiveImageTasksForUser(userId: string) {
    cleanupImageTasks();
    markStaleImageTasks();
    return Array.from(tasks.values()).filter((task) => task.userId === userId && (task.status === "pending" || task.status === "running")).length;
}

export function listRecoverableImageTasks() {
    cleanupImageTasks();
    markStaleImageTasks();
    return Array.from(tasks.values()).filter((task) => (task.status === "pending" || task.status === "running") && task.execution);
}

export function updateImageTask(id: string, patch: Partial<Pick<ImageTask, "status" | "result" | "error" | "pointsRemaining" | "execution">>) {
    const task = tasks.get(id);
    if (!task) return null;
    const next = { ...task, ...patch, updatedAt: Date.now() };
    tasks.set(id, next);
    const heartbeatOnly = task.status === "running" && patch.status === "running" && Object.keys(patch).length === 1;
    if (!heartbeatOnly) persistImageTask(next);
    return next;
}

function cleanupImageTasks() {
    const expiresBefore = Date.now() - TASK_TTL_MS;
    for (const [id, task] of tasks) {
        if (task.updatedAt < expiresBefore) {
            tasks.delete(id);
            removePersistedImageTask(id);
        }
    }
}

function markStaleImageTasks() {
    const expiresBefore = Date.now() - TASK_STALE_MS;
    for (const [id, task] of tasks) {
        if ((task.status === "pending" || task.status === "running") && task.updatedAt < expiresBefore) {
            const next = {
                ...task,
                status: "error",
                error: "生成任务已中断，请重新生成。",
                execution: undefined,
                updatedAt: Date.now(),
            } satisfies ImageTask;
            tasks.set(id, next);
            persistImageTask(next);
        }
    }
}

function loadPersistedImageTasks() {
    const loaded = new Map<string, ImageTask>();
    try {
        mkdirSync(TASK_DATA_DIR, { recursive: true, mode: 0o700 });
        for (const fileName of readdirSync(TASK_DATA_DIR)) {
            if (!fileName.endsWith(".json")) continue;
            try {
                const task = JSON.parse(readFileSync(join(TASK_DATA_DIR, fileName), "utf8")) as ImageTask;
                if (!task?.id || !task.userId || !task.config?.model || !task.createdAt || !task.updatedAt) continue;
                loaded.set(task.id, task);
            } catch (error) {
                console.warn("Image task restore failed", fileName, error instanceof Error ? error.message : error);
            }
        }
    } catch (error) {
        console.warn("Image task directory restore failed", error instanceof Error ? error.message : error);
    }
    return loaded;
}

function persistImageTask(task: ImageTask) {
    try {
        mkdirSync(TASK_DATA_DIR, { recursive: true, mode: 0o700 });
        const target = join(TASK_DATA_DIR, `${task.id}.json`);
        const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
        writeFileSync(temporary, `${JSON.stringify(task)}\n`, { encoding: "utf8", mode: 0o600 });
        renameSync(temporary, target);
    } catch (error) {
        console.error("Image task persistence failed", task.id, error instanceof Error ? error.message : error);
    }
}

function removePersistedImageTask(id: string) {
    try {
        rmSync(join(TASK_DATA_DIR, `${id}.json`), { force: true });
    } catch (error) {
        console.warn("Image task cleanup failed", id, error instanceof Error ? error.message : error);
    }
}

function scheduleImageTaskCleanup() {
    const timer = setInterval(() => {
        cleanupImageTasks();
        markStaleImageTasks();
    }, TASK_CLEANUP_INTERVAL_MS);
    timer.unref();
    return timer;
}
