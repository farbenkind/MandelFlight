export function createAudioUpdates({ sampleRate, updateAudio, getBeats, onBeatUpdate }) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
        throw new Error("Audio update sample rate must be positive and finite.");
    }
    const samplesPerUpdate = sampleRate / 40;
    let pendingSamples = 0;
    return samples => {
        updateAudio(samples);
        pendingSamples += samples.length;
        if (pendingSamples >= samplesPerUpdate) {
            pendingSamples %= samplesPerUpdate;
            onBeatUpdate(getBeats());
        }
    };
}
