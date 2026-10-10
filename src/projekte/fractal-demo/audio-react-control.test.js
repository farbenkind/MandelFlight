import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAudioReactControl, handleAudioReactShortcut } from "./audio-react-control.js";

function fixture() {
    let click, updates = 0;
    const button = {
        attributes: {},
        setAttribute(key, value) { this.attributes[key] = value; },
        addEventListener(type, listener) { assert.equal(type, "click"); click = listener; },
    };
    const control = createAudioReactControl(button, () => updates++);
    return { button, control, click: () => click(), updates: () => updates };
}

test("pause freezes automatic updates and resume continues through the same control", () => {
    const f = fixture();
    f.control.update();
    assert.equal(f.updates(), 1);
    f.click();
    f.control.update();
    f.control.update();
    assert.equal(f.updates(), 1);
    assert.equal(f.button.attributes["aria-pressed"], "true");
    assert.match(f.button.textContent, /fortsetzen/);
    f.control.toggle();
    f.control.update();
    assert.equal(f.updates(), 2);
    assert.equal(f.button.attributes["aria-pressed"], "false");
});

test("Space toggles once, prevents scrolling and leaves dialogs and text editing alone", () => {
    const f = fixture();
    let prevented = 0;
    const event = { key: " ", target: { closest: () => null }, preventDefault: () => prevented++ };
    assert.equal(handleAudioReactShortcut(event, f.control, false), true);
    assert.equal(f.button.attributes["aria-pressed"], "true");
    handleAudioReactShortcut({ ...event, repeat: true }, f.control, false);
    assert.equal(f.button.attributes["aria-pressed"], "true");
    assert.equal(prevented, 2);
    for (const ignored of [
        { ...event, key: "s" }, { ...event, ctrlKey: true },
        { ...event, target: { closest: () => ({}) } },
        { ...event, target: { closest: () => null, isContentEditable: true } },
    ]) assert.equal(handleAudioReactShortcut(ignored, f.control, false), false);
    assert.equal(handleAudioReactShortcut(event, f.control, true), false);
    assert.equal(prevented, 2);
});

test("both editors provide the pause button and actual dialog IDs used by the shortcut guard", async () => {
    for (const path of ["../../../index.html", "./index.html"]) {
        const html = await readFile(new URL(path, import.meta.url), "utf8");
        assert.match(html, /id="audioReactBtn"[^>]*aria-pressed="false"/);
        for (const id of ["modOverlay", "problemPopup"]) assert.ok(html.includes(`id="${id}"`));
    }
});
