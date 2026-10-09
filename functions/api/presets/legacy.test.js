import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "./[[path]].js";

test("legacy KV preset API remains readable but rejects shared-key writes", async () => {
    const env = {
        PRESETS: {
            async list() {
                return { keys: [{ name: "fractal/Old Visual", metadata: { created: 10, kind: "visualization" } }], list_complete: true };
            },
            async get(key) {
                return key === "fractal/Old Visual" ? '{"version":1}' : null;
            },
        },
    };
    const list = await onRequest({
        request: new Request("https://mandelflight.pages.dev/api/presets/fractal"),
        env,
        params: { path: ["fractal"] },
    });
    assert.equal(list.status, 200);
    assert.equal((await list.json())[0].name, "Old Visual");

    const legacyWrite = await onRequest({
        request: new Request("https://mandelflight.pages.dev/api/presets/fractal/Old%20Visual", {
            method: "PUT",
            headers: { "x-api-key": "old-shared-key" },
            body: '{"version":1}',
        }),
        env,
        params: { path: ["fractal", "Old Visual"] },
    });
    assert.equal(legacyWrite.status, 410);
});
