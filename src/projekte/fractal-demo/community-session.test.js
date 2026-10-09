import { test } from "node:test";
import assert from "node:assert/strict";
import { createCommunitySession } from "./community-session.js";

function createClient() {
    let authListener;
    const profileQueries = [];
    const client = {
        auth: {
            onAuthStateChange(listener) {
                authListener = listener;
                return { data: { subscription: { unsubscribe() {} } } };
            },
            async getSession() {
                return { data: { session: null }, error: null };
            },
        },
        rpc(name) {
            assert.equal(name, "get_workspace_access");
            return {
                setHeader() { return this; },
                then(resolve, reject) {
                    return new Promise((res, rej) => {
                        profileQueries.push({ resolve: res, reject: rej });
                    }).then(resolve, reject);
                },
            };
        },
        emit(event, session) {
            authListener(event, session);
        },
        profileQueries,
    };
    return client;
}

function flushProfileLookup() {
    return new Promise(resolve => setImmediate(resolve));
}

test("community session publishes auth state and resolves profile admin status", async () => {
    const client = createClient();
    const states = [];
    const service = createCommunitySession({ client, onError: error => { throw error; } });
    service.subscribe(state => states.push(state));
    await service.start();
    client.emit("SIGNED_IN", { user: { id: "user-1" } });
    assert.equal(service.getSession().user.id, "user-1");
    assert.equal(service.getSnapshot().isAdmin, false);

    await flushProfileLookup();
    client.profileQueries[0].resolve({ data: { can_admin: true }, error: null });
    await flushProfileLookup();
    assert.equal(service.getSnapshot().isAdmin, false);
    assert.equal(states.at(-1).canAdmin, true);
    assert.equal(states.at(-1).workspaceReady, true);
    assert.equal(states.at(-1).mode, "user");
});

test("stale profile responses cannot restore admin state after sign-out", async () => {
    const client = createClient();
    const service = createCommunitySession({ client, onError: error => { throw error; } });
    await service.start();
    client.emit("SIGNED_IN", { user: { id: "user-1" } });
    await flushProfileLookup();
    client.emit("SIGNED_OUT", null);

    client.profileQueries[0].resolve({ data: { can_admin: true }, error: null });
    await flushProfileLookup();
    assert.equal(service.getSession(), null);
    assert.equal(service.getSnapshot().isAdmin, false);
});

test("eligible admins explicitly switch between A modes and isolated B, then sign-out resets mode", async () => {
    const client = createClient();
    const service = createCommunitySession({ client });
    await service.start();
    client.emit("SIGNED_IN", { user: { id: "admin" } });
    await flushProfileLookup();
    client.profileQueries[0].resolve({ data: { can_admin: true }, error: null });
    await flushProfileLookup();
    const adminSwitch = service.setMode("admin");
    await flushProfileLookup();
    assert.equal(service.getSnapshot().workspaceReady, false);
    client.profileQueries[1].resolve({ data: { can_admin: true }, error: null });
    await adminSwitch;
    assert.equal(service.getSnapshot().isAdmin, true);
    assert.equal(service.getSnapshot().dataset, "A");
    const testSwitch = service.setMode("test");
    await flushProfileLookup();
    client.profileQueries[2].resolve({ data: { can_admin: true }, error: null });
    await testSwitch;
    assert.equal(service.getSnapshot().isAdmin, false);
    assert.equal(service.getSnapshot().dataset, "B");
    client.emit("SIGNED_OUT", null);
    assert.equal(service.getSnapshot().dataset, "A");
    assert.equal(service.getSnapshot().canAdmin, false);
});

test("ordinary users cannot switch to admin or test workspace", async () => {
    const client = createClient();
    const service = createCommunitySession({ client });
    await service.start();
    client.emit("SIGNED_IN", { user: { id: "ordinary" } });
    await flushProfileLookup();
    client.profileQueries[0].resolve({ data: { can_admin: false }, error: null });
    await flushProfileLookup();
    await assert.rejects(service.setMode("admin"), /berechtigte Admins/);
    await assert.rejects(service.setMode("test"), /berechtigte Admins/);
});

test("failed mode confirmation returns to User/A and a stale confirmation cannot restore signed-out state", async () => {
    const client = createClient();
    const service = createCommunitySession({ client });
    await service.start();
    client.emit("SIGNED_IN", { user: { id: "admin" } });
    await flushProfileLookup();
    client.profileQueries[0].resolve({ data: { can_admin: true }, error: null });
    await flushProfileLookup();
    const failed = service.setMode("test");
    const failure = assert.rejects(failed, /network unavailable/);
    await flushProfileLookup();
    client.profileQueries[1].resolve({ data: null, error: { message: "network unavailable" } });
    await failure;
    assert.equal(service.getSnapshot().mode, "user");
    assert.equal(service.getSnapshot().isAdmin, false);
    const stale = service.setMode("admin");
    const rejection = assert.rejects(stale, /Anmeldung hat sich/);
    await flushProfileLookup();
    client.emit("SIGNED_OUT", null);
    client.profileQueries[2].resolve({ data: { can_admin: true }, error: null });
    await rejection;
    assert.equal(service.getSession(), null);
    assert.equal(service.getSnapshot().mode, "user");
    assert.equal(service.getSnapshot().canAdmin, false);
});

test("auth state changes take precedence over a late initial session response", async () => {
    const client = createClient();
    let resolveInitialSession;
    client.auth.getSession = () => new Promise(resolve => { resolveInitialSession = resolve; });
    const service = createCommunitySession({ client });
    const starting = service.start();
    client.emit("SIGNED_IN", { user: { id: "new-user" } });
    resolveInitialSession({ data: { session: { user: { id: "stale-user" } } }, error: null });
    await starting;
    assert.equal(service.getSession().user.id, "new-user");
});
