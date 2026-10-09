import { test } from "node:test";
import assert from "node:assert/strict";
import { createAudioUpdates } from "./audio-updates.js";

test("audio samples drive 40 updates per second without foreground timers", () => {
    for (const sampleRate of [44100, 48000, 96000]) {
        let processed = 0;
        const updates = [];
        const update = createAudioUpdates({
            sampleRate,
            updateAudio: samples => { processed += samples.length; },
            getBeats: () => ({ sample: processed }),
            onBeatUpdate: beats => updates.push(beats.sample),
        });
        const total = sampleRate * 10;
        for (let sample = 0; sample < total; sample += 128) {
            update(new Float32Array(Math.min(128, total - sample)));
        }
        assert.equal(processed, total);
        assert.equal(updates.length, 400);
        updates.forEach((sample, index) => {
            const expected = (index + 1) * sampleRate / 40;
            assert.ok(sample >= expected && sample - expected < 128);
        });
    }
});

test("empty packets do not tick, large packets do not replay stale beat data", () => {
    let updates = 0;
    const update = createAudioUpdates({
        sampleRate: 48000, updateAudio() {}, getBeats: () => ({}),
        onBeatUpdate: () => updates++,
    });
    update(new Float32Array(0));
    assert.equal(updates, 0);
    update(new Float32Array(4800));
    assert.equal(updates, 1);
    update(new Float32Array(1199));
    assert.equal(updates, 1);
    update(new Float32Array(1));
    assert.equal(updates, 2);
    assert.throws(() => createAudioUpdates({ sampleRate: 0 }), /positive/);
});
