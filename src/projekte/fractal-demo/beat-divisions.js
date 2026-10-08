const divisions = [
    ["4B", "4 Bars", 16],
    ["2B", "2 Bars", 8],
    ["1B", "1 Bar", 4],
];

for (const [suffix, factor] of [["", 1], ["D", 3 / 2], ["T", 2 / 3]]) {
    for (const denominator of [2, 4, 8, 16, 32]) {
        const value = `1/${denominator}${suffix}`;
        divisions.push([value, value, 4 / denominator * factor]);
    }
}

export const beatDivisions = Object.freeze(divisions.map(([value, label, beats]) =>
    Object.freeze({ value, label, beats })));

export function dividedBeatPhase(position, division) {
    if (!Number.isFinite(position)) throw new Error("BeatClock position is not initialized.");
    const entry = beatDivisions.find(entry => entry.value === division);
    if (!entry) throw new Error(`Unknown BeatClock division: ${division}`);
    const cycles = position / entry.beats;
    return cycles - Math.floor(cycles);
}
