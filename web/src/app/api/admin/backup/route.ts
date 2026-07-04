import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { resolveServerDataPath } from "@/lib/server/data-dir";

export const runtime = "nodejs";

export async function GET() {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (currentUser.role !== "admin") return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    const exportedAt = new Date().toISOString();
    const backup = {
        app: "VOZEB",
        version: 1,
        exportedAt,
        files: {
            auth: await readDataJson("auth.json"),
            prompts: await readDataJson("prompts.json"),
        },
    };

    return new NextResponse(JSON.stringify(backup, null, 2), {
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="vozeb-data-backup-${exportedAt.slice(0, 10)}.json"`,
            "Cache-Control": "no-store",
        },
    });
}

async function readDataJson(fileName: string) {
    try {
        return JSON.parse(await readFile(resolveServerDataPath(fileName), "utf8")) as unknown;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
    }
}
