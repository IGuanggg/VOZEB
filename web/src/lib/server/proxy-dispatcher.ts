import { execFileSync } from "node:child_process";
import { Agent, ProxyAgent, setGlobalDispatcher } from "undici";

let configuredProxy: string | null = null;
let windowsProxyCache: string | null | undefined;
const LONG_FETCH_TIMEOUT_MS = 20 * 60 * 1000;

export function configureServerProxyDispatcher() {
    const proxy = resolveProxyUrl();
    if (proxy === configuredProxy) return;
    setGlobalDispatcher(
        proxy
            ? new ProxyAgent(proxy)
            : new Agent({
                  headersTimeout: LONG_FETCH_TIMEOUT_MS,
                  bodyTimeout: LONG_FETCH_TIMEOUT_MS,
              }),
    );
    configuredProxy = proxy;
}

function resolveProxyUrl() {
    return (
        process.env.HTTPS_PROXY ||
        process.env.HTTP_PROXY ||
        process.env.ALL_PROXY ||
        process.env.https_proxy ||
        process.env.http_proxy ||
        process.env.all_proxy ||
        process.env.npm_config_https_proxy ||
        process.env.npm_config_proxy ||
        readWindowsSystemProxy() ||
        ""
    );
}

function readWindowsSystemProxy() {
    if (process.platform !== "win32") return "";
    if (windowsProxyCache !== undefined) return windowsProxyCache || "";

    try {
        const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
        const enabled = execFileSync("reg", ["query", key, "/v", "ProxyEnable"], { encoding: "utf8", timeout: 1000, windowsHide: true });
        if (!/\sProxyEnable\s+REG_DWORD\s+0x1/i.test(enabled)) {
            windowsProxyCache = null;
            return "";
        }

        const server = execFileSync("reg", ["query", key, "/v", "ProxyServer"], { encoding: "utf8", timeout: 1000, windowsHide: true });
        const match = server.match(/\sProxyServer\s+REG_SZ\s+(.+)\s*$/im);
        windowsProxyCache = normalizeProxyServer(match?.[1] || "");
        return windowsProxyCache || "";
    } catch {
        windowsProxyCache = null;
        return "";
    }
}

function normalizeProxyServer(value: string) {
    const entries = value
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean);
    const preferred = entries.find((item) => /^https=/i.test(item)) || entries.find((item) => /^http=/i.test(item)) || entries[0] || "";
    const proxy = preferred.includes("=") ? preferred.split("=").slice(1).join("=").trim() : preferred;
    if (!proxy || /^socks/i.test(proxy)) return "";
    return /^https?:\/\//i.test(proxy) ? proxy : `http://${proxy}`;
}
