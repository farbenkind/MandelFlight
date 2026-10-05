export const pi = Math.PI;

export const debug = { on: false };

export const fmod = (x, m) => ((x % m) + m) % m;

export function myPow(base, exp) {
    if (exp >= 0)
        return Math.pow(base, exp);
    return Math.pow(base, -1 / exp)
}
export const symExp = (max) => Math.log2(max * max / (max - 1));

export function log(desc, val) {
    if (debug.on) {
        console.log(desc, val);
    }
}
export function clamp(x, min, max) {
    return x >= min ? (x < max ? x : max) : min;
}
