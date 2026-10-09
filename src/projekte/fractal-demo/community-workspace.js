const MODES = new Set(["user", "admin", "test"]);
let mode = "user";
let userId = null;

export function setWorkspaceUser(id) {
    userId = id ?? null;
}

export function scopeWorkspaceRequest(request) {
    request.setHeader("x-mandelflight-mode", mode);
    if (userId) request.setHeader("x-mandelflight-user", userId);
    return request;
}

export function getWorkspaceMode() {
    return mode;
}

export function setWorkspaceMode(nextMode) {
    if (!MODES.has(nextMode)) throw new Error("Unbekannter Arbeitsmodus.");
    mode = nextMode;
}

export function getWorkspaceDataset() {
    return mode === "test" ? "B" : "A";
}

export function workspaceFetch(fetcher = globalThis.fetch) {
    return (input, init = {}) => {
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(init.headers).forEach((value, key) => headers.set(key, value));
        if (!headers.has("x-mandelflight-mode")) headers.set("x-mandelflight-mode", mode);
        return fetcher(input, { ...init, headers });
    };
}
