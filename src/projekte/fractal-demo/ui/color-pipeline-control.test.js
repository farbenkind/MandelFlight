import { test } from "node:test";
import assert from "node:assert/strict";
import { createColorPipelineControl } from "./color-pipeline-control.js";
import { createColorPipeline } from "../colormap/color-pipeline.js";

test("legacy style upgrades only after confirmation and refresh follows later preset loads", () => {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const elements = [];
    globalThis.document = {
        createElement() {
            const element = {
                append() {},
                addEventListener(_, callback) { this.click = callback; },
            };
            elements.push(element);
            return element;
        },
    };
    let confirmed = false;
    globalThis.window = { confirm: () => confirmed };
    try {
        const pipeline = createColorPipeline();
        pipeline.setVersion(1);
        let changes = 0;
        const control = createColorPipelineControl({
            root: { append() {} }, colorPipeline: pipeline, onChange: () => changes++,
        });
        const [, label, button] = elements;
        assert.equal(button.hidden, false);
        button.click();
        assert.equal(pipeline.getVersion(), 1);
        assert.equal(changes, 0);
        confirmed = true;
        button.click();
        assert.equal(pipeline.getVersion(), 2);
        assert.equal(changes, 1);
        assert.equal(button.hidden, true);
        assert.match(label.textContent, /Dreamy/);
        pipeline.setVersion(undefined);
        control.refresh();
        assert.equal(button.hidden, false);
        assert.match(label.textContent, /Preset-kompatibel/);
    } finally {
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
    }
});
