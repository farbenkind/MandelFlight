import init, { update_audio, get_beats, set_sample_rate } from "./modcore.js";
import { createAudioUpdates } from "./audio-updates.js";

export async function startAudioInput(onBeatUpdate) {
    await init();

    const audioContext = new AudioContext();
    set_sample_rate(audioContext.sampleRate);
    await audioContext.audioWorklet.addModule(new URL("./pcm-processor.js", import.meta.url));

    const pcmNode = new AudioWorkletNode(audioContext, "pcm-proc");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mic = audioContext.createMediaStreamSource(stream);
    mic.connect(pcmNode);
    pcmNode.connect(audioContext.destination);

    // Browser starten den AudioContext oft erst nach einer Benutzeraktion
    const resume = () => { if (audioContext.state !== "running") audioContext.resume(); };
    resume();
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);

    const update = createAudioUpdates({
        sampleRate: audioContext.sampleRate,
        updateAudio: update_audio,
        getBeats: get_beats,
        onBeatUpdate,
    });
    pcmNode.port.onmessage = event => update(event.data);
}