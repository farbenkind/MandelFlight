import { test } from "node:test";
import assert from "node:assert/strict";
import { createCommunityAuthUI } from "./community-auth-ui.js";

function createElement() {
    const listeners = new Map();
    return {
        textContent: "",
        disabled: false,
        value: "",
        classList: {
            toggles: new Map(),
            toggle(name, force) { this.toggles.set(name, force); },
        },
        addEventListener(type, listener) { listeners.set(type, listener); },
        click() { listeners.get("click")?.(); },
        change() { listeners.get("change")?.(); },
    };
}

function createDocument() {
    const elements = new Map([
        "authSignedOut",
        "authSignedIn",
        "authUserName",
        "problemBtn",
        "communityConfigNotice",
        "landingPresetAdminControls",
        "authGithubBtn",
        "authSignOutBtn",
        "authWorkspace",
        "authWorkspaceMode",
        "authWorkspaceStatus",
    ].map(id => [id, createElement()]));
    return {
        elements,
        getElementById(id) {
            assert.ok(elements.has(id), `Unexpected element: ${id}`);
            return elements.get(id);
        },
    };
}

test("community auth UI reflects session state and binds auth actions", async () => {
    const originalDocument = globalThis.document;
    const fakeDocument = createDocument();
    globalThis.document = fakeDocument;
    try {
        let publishState;
        const actions = [];
        const states = [];
        let selectedMode = null;
        const session = {
            subscribe(listener) {
                publishState = listener;
                listener({ user: null, isAdmin: false });
            },
            start: async () => {},
            setMode: async mode => { selectedMode = mode; },
            getSnapshot: () => ({ user: { id: "user-2" }, mode: selectedMode, canAdmin: true, workspaceReady: true }),
        };
        createCommunityAuthUI({
            communitySession: session,
            execute: action => {
                actions.push(action);
                return Promise.resolve();
            },
            onSignIn: async () => {},
            onSignOut: async () => {},
            onStateChange: state => states.push(state),
            onError: error => { throw error; },
        });

        publishState({
            user: { email: "user@example.com", user_metadata: {} },
            isAdmin: true,
        });
        assert.equal(fakeDocument.elements.get("authSignedOut").classList.toggles.get("hidden"), true);
        assert.equal(fakeDocument.elements.get("authSignedIn").classList.toggles.get("hidden"), false);
        assert.equal(fakeDocument.elements.get("authUserName").textContent, "Angemeldet (user@example.com)");
        assert.equal(fakeDocument.elements.get("problemBtn").disabled, false);
        assert.equal(fakeDocument.elements.get("landingPresetAdminControls").classList.toggles.get("hidden"), false);
        assert.equal(states.at(-1).isAdmin, true);

        publishState({ user: { id: "user-2" }, isAdmin: false });
        assert.equal(fakeDocument.elements.get("landingPresetAdminControls").classList.toggles.get("hidden"), true);
        fakeDocument.elements.get("authGithubBtn").click();
        fakeDocument.elements.get("authSignOutBtn").click();
        assert.equal(actions.length, 2);
        assert.equal(typeof actions[0], "function");
        assert.equal(typeof actions[1], "function");

        publishState({ user: null, isAdmin: false, canAdmin: false, workspaceReady: true });
        assert.equal(fakeDocument.elements.get("authSignedOut").classList.toggles.get("hidden"), false);
        assert.equal(fakeDocument.elements.get("authSignedIn").classList.toggles.get("hidden"), true);
        assert.equal(fakeDocument.elements.get("authWorkspace").classList.toggles.get("hidden"), true);
        assert.equal(fakeDocument.elements.get("problemBtn").disabled, true);
        assert.match(fakeDocument.elements.get("authWorkspaceStatus").textContent, /Nicht angemeldet/);

        fakeDocument.elements.get("authWorkspaceMode").value = "test";
        fakeDocument.elements.get("authWorkspaceMode").change();
        assert.equal(actions.length, 3);
        assert.equal(typeof actions[2], "function");
        await actions[2]();
        assert.equal(selectedMode, "test");
        assert.match(fakeDocument.elements.get("authWorkspaceStatus").textContent, /Datensatz B/);
    } finally {
        globalThis.document = originalDocument;
    }
});

test("community auth UI explains when the community service is unavailable", () => {
    const originalDocument = globalThis.document;
    const fakeDocument = createDocument();
    globalThis.document = fakeDocument;
    try {
        createCommunityAuthUI({
            communitySession: null,
            execute: () => {},
            onSignIn: () => {},
            onSignOut: () => {},
            onStateChange: () => {},
            onError: () => {},
        });
        assert.match(fakeDocument.elements.get("communityConfigNotice").textContent, /noch nicht eingerichtet/);
    } finally {
        globalThis.document = originalDocument;
    }
});
