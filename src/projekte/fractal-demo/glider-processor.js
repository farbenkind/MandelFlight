export function makeGliderProcessor(inputParam) {
    inputParam.label = "Input";
    return {
        name: "glider",
        type: "glider",
        output: null,
        params: {
            input: inputParam,
            speed: { label: "Speed", ui: "slider", min: 0, max: 1, exp: false, value: 0.5 },
        },
        update(context) {
            const speed = this.params.speed.value;
            if (!Number.isFinite(speed) || speed < 0 || speed > 1) {
                throw new Error("Glider Speed must be in [0, 1].");
            }
            if (!Number.isFinite(context.deltaTime) || context.deltaTime < 0) {
                throw new Error("Glider deltaTime must be finite and nonnegative.");
            }
            const input = context.input(this, "input");
            if (!Number.isFinite(input)) throw new Error("Glider Input must be finite.");
            if (this.output === null) this.output = input;
            else {
                const rate = 0.001 * Math.pow(100000, speed);
                const factor = -Math.expm1(-rate * context.deltaTime);
                this.output += (input - this.output) * factor;
            }
            return this.output;
        },
    };
}
