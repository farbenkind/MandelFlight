export function attachFractalNavigation(canvas, params, onChange) {
    canvas.addEventListener("wheel", event => {
        event.preventDefault();
        const bounds = canvas.getBoundingClientRect();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
        const factor = Math.exp(Math.max(-1, Math.min(1, event.deltaY * unit * 0.001)));
        params[2] *= factor;
        onChange();
    }, { passive: false });

    let pointerId = null;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener("pointerdown", event => {
        if (!event.isPrimary || event.button !== 0 || pointerId !== null) return;
        event.preventDefault();
        pointerId = event.pointerId;
        lastX = event.clientX;
        lastY = event.clientY;
        canvas.setPointerCapture(pointerId);
        canvas.classList.add("navigating");
    });

    canvas.addEventListener("pointermove", event => {
        if (event.pointerId !== pointerId) return;
        const bounds = canvas.getBoundingClientRect();
        params[0] -= (event.clientX - lastX) / bounds.width * params[2] * params[4];
        params[1] += (event.clientY - lastY) / bounds.height * params[2];
        lastX = event.clientX;
        lastY = event.clientY;
        onChange();
    });

    const endDrag = () => {
        const capturedId = pointerId;
        pointerId = null;
        canvas.classList.remove("navigating");
        if (capturedId !== null && canvas.hasPointerCapture(capturedId)) {
            canvas.releasePointerCapture(capturedId);
        }
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("lostpointercapture", endDrag);
    window.addEventListener("blur", endDrag);
}
