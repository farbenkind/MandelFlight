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
// utils.js

export function makeDraggable(windowEl, headerEl) {

    let dragging = false;
    let startX = 0;
    let startY = 0;

    headerEl.addEventListener("mousedown", e => {

        dragging = true;

        startX = e.clientX - windowEl.offsetLeft;
        startY = e.clientY - windowEl.offsetTop;

    });

    window.addEventListener("mousemove", e => {

        if (!dragging) return;

        windowEl.style.left =
            (e.clientX - startX) + "px";

        windowEl.style.top =
            (e.clientY - startY) + "px";

         console.log(
    e.clientX - startX,
    e.clientY - startY
);   

    });

    window.addEventListener("mouseup", () => {
        dragging = false;
        localStorage.setItem(
            "modOverlayPos",
            JSON.stringify({
            left: windowEl.style.left,
            top: windowEl.style.top
    })
);
    });
}