import { test } from "node:test";
import assert from "node:assert/strict";
import { getWorkspaceDataset, setWorkspaceMode, setWorkspaceUser, scopeWorkspaceRequest, workspaceFetch } from "./community-workspace.js";
import { createPresetWorkspaceState } from "./preset-workspace-state.js";

test("request headers pin workspace and identity while other modes can change", async () => {
    setWorkspaceMode("test");
    setWorkspaceUser("admin-1");
    const headers = new Headers();
    scopeWorkspaceRequest({ setHeader(key, value) { headers.set(key, value); return this; } });
    setWorkspaceMode("user");
    setWorkspaceUser("user-2");
    await workspaceFetch(async (_url, init) => {
        assert.equal(init.headers.get("x-mandelflight-mode"), "test");
        assert.equal(init.headers.get("x-mandelflight-user"), "admin-1");
        return new Response();
    })("https://example.test", { headers });
    assert.equal(getWorkspaceDataset(), "A");
    assert.throws(() => setWorkspaceMode("other"), /Unbekannter/);
    setWorkspaceUser(null);
});

test("workspace changes invalidate old actions, auth refreshes do not invalidate stable identity", () => {
    const state = createPresetWorkspaceState();
    const user = { id: "admin-1" };
    state.update({ user, mode: "user", workspaceReady: true });
    const before = state.ticket();
    assert.equal(state.update({ user, mode: "user", workspaceReady: true }), false);
    state.assert(before);
    state.update({ user, mode: "test", workspaceReady: false });
    assert.throws(() => state.assert(before), /Arbeitsmodus/);
    const changing = state.ticket();
    state.update({ user, mode: "test", workspaceReady: true });
    assert.throws(() => state.assert(changing), /Arbeitsmodus/);
    const settled = state.ticket();
    state.update({ user: null, mode: "user", workspaceReady: false });
    assert.throws(() => state.assert(settled), /Konto/);
});
