import { test } from "node:test";
import assert from "node:assert/strict";
import { listLegacyCloudPresets, loadLegacyCloudPreset } from "./legacy-preset-store.js";

test("legacy cloud list uses read-only uncached requests and retains visual presets", async () => {
    const entries = await listLegacyCloudPresets(async (url, options) => {
        assert.equal(url, "/api/presets/fractal");
        assert.deepEqual(options, { cache: "no-store" });
        return Response.json([{ name: "maxine", kind: "visualization" }, { name: "Other", kind: "chain" }]);
    });
    assert.deepEqual(entries, [{ name: "maxine", kind: "visualization" }]);
});

test("legacy cloud loading encodes names and validates the existing visual format", async () => {
    const preset = { name: "white flash II", knobs: {}, fractalParams: { centerX: 0, centerY: 0, zoom: 1, iter: 500 } };
    assert.deepEqual(await loadLegacyCloudPreset(preset.name, async (url, options) => {
        assert.equal(url, "/api/presets/fractal/white%20flash%20II");
        assert.deepEqual(options, { cache: "no-store" });
        return Response.json(preset);
    }), preset);
});

test("legacy cloud failures and malformed payloads are explicit", async () => {
    await assert.rejects(listLegacyCloudPresets(async () => new Response("", { status: 500 })), /HTTP 500/);
    await assert.rejects(listLegacyCloudPresets(async () => Response.json({})), /Ungueltige Liste/);
    await assert.rejects(listLegacyCloudPresets(async () => Response.json([null])), /Ungueltige Liste/);
    await assert.rejects(loadLegacyCloudPreset("", async () => assert.fail()), /Name fehlt/);
    await assert.rejects(loadLegacyCloudPreset("bad", async () => Response.json({})), /Ungueltige Fraktal/);
});
