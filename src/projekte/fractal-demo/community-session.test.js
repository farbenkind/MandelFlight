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
        from(table) {
            assert.equal(table, "profiles");
            return {
                select(column) {
                    assert.equal(column, "is_admin");
                    return {
                        eq(key, userId) {
                            assert.equal(key, "id");
                            return {
                                maybeSingle() {
                                    return new Promise((resolve, reject) => {
                                        profileQueries.push({ userId, resolve, reject });
                                    });
                                },
                            };
                        },
                    };
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
    client.profileQueries[0].resolve({ data: { is_admin: true }, error: null });
    await flushProfileLookup();
    assert.equal(service.getSnapshot().isAdmin, true);
    assert.equal(states.at(-1).isAdmin, true);
});

test("stale profile responses cannot restore admin state after sign-out", async () => {
    const client = createClient();
    const service = createCommunitySession({ client, onError: error => { throw error; } });
    await service.start();
    client.emit("SIGNED_IN", { user: { id: "user-1" } });
    await flushProfileLookup();
    client.emit("SIGNED_OUT", null);

    client.profileQueries[0].resolve({ data: { is_admin: true }, error: null });
    await flushProfileLookup();
    assert.equal(service.getSession(), null);
    assert.equal(service.getSnapshot().isAdmin, false);
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
