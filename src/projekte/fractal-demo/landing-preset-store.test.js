import { test } from "node:test";
import assert from "node:assert/strict";
import { getLandingPreset, setLandingPreset } from "./landing-preset-store.js";

test("reads the public landing preset setting", async () => {
    const preset = { schemaVersion: 1, kind: "visual" };
    const client = {
        from(table) {
            assert.equal(table, "site_settings");
            return {
                select(columns) {
                    assert.equal(columns, "setting_value");
                    return {
                        eq(column, value) {
                            assert.equal(column, "setting_key");
                            assert.equal(value, "landing_preset");
                            return {
                                async maybeSingle() {
                                    return { data: { setting_value: preset }, error: null };
                                },
                            };
                        },
                    };
                },
            };
        },
    };
    assert.equal(await getLandingPreset(client), preset);
});

test("returns no landing preset when the setting has not been created", async () => {
    const client = {
        from: () => ({
            select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
        }),
    };
    assert.equal(await getLandingPreset(client), null);
    assert.equal(await getLandingPreset(null), null);
});

test("stores landing preset through the privileged server-side RPC", async () => {
    const preset = { schemaVersion: 1, kind: "visual" };
    const client = {
        async rpc(name, args) {
            assert.equal(name, "set_landing_preset");
            assert.deepEqual(args, { preset_payload: preset });
            return { error: null };
        },
    };
    await setLandingPreset(preset, client);
});

test("surfaces database errors instead of reporting a successful landing preset write", async () => {
    const client = {
        async rpc() {
            return { error: { message: "Administrator access required" } };
        },
    };
    await assert.rejects(setLandingPreset({}, client), /Administrator access required/);
});
