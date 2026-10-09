import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "./turnstile.js";

test("Turnstile endpoint rejects unconfigured and malformed requests", async () => {
    const missing = await onRequestPost({
        request: new Request("https://mandelflight.pages.dev/api/turnstile", { method: "POST", body: "{}" }),
        env: {},
    });
    assert.equal(missing.status, 503);

    const malformed = await onRequestPost({
        request: new Request("https://mandelflight.pages.dev/api/turnstile", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "" }),
        }),
        env: { TURNSTILE_SECRET_KEY: "test-secret" },
    });
    assert.equal(malformed.status, 400);
});

test("Turnstile endpoint verifies success and enforces hostnames", async () => {
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => Response.json({ success: true, hostname: "mandelflight.pages.dev" });
        const makeRequest = () => new Request("https://mandelflight.pages.dev/api/turnstile", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: "valid-test-token" }),
        });
        const success = await onRequestPost({ request: makeRequest(), env: { TURNSTILE_SECRET_KEY: "test-secret" } });
        assert.equal(success.status, 200);

        globalThis.fetch = async () => Response.json({ success: true, hostname: "attacker.example" });
        const rejected = await onRequestPost({ request: makeRequest(), env: { TURNSTILE_SECRET_KEY: "test-secret" } });
        assert.equal(rejected.status, 403);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
