import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Google sign-in is absent from every app entry page while GitHub remains", async () => {
    const entryPages = [
        new URL("../../../index.html", import.meta.url),
        new URL("./index.html", import.meta.url),
    ];
    for (const entryPage of entryPages) {
        const html = await readFile(entryPage, "utf8");
        assert.doesNotMatch(html, /authGoogleBtn|Mit Google anmelden/);
        assert.match(html, /authGithubBtn/);
        assert.match(html, /id="landingPresetAdminControls" class="hidden"/);
        assert.match(html, /id="setLandingPresetBtn"/);
        assert.doesNotMatch(html, /authSwitchAccountBtn|authGithubAccountInput/);
        assert.match(html, /id="authWorkspace" class="hidden"/);
        assert.match(html, /id="authWorkspaceMode" disabled/);
        for (const mode of ["user", "admin", "test"]) assert.match(html, new RegExp(`value="${mode}"`));
        assert.match(html, /id="presetSaveTarget"/);
    }
});
