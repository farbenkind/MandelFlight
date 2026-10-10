export function createAudioReactControl(button, onUpdate) {
    let paused = false;

    function render() {
        button.textContent = paused ? "Audio-Reaktion fortsetzen (Space)" : "Audio-Reaktion pausieren (Space)";
        button.setAttribute("aria-pressed", String(paused));
    }

    function toggle() {
        paused = !paused;
        render();
    }

    button.addEventListener("click", toggle);
    render();
    return {
        toggle,
        update() {
            if (!paused) onUpdate();
        },
    };
}

export function handleAudioReactShortcut(event, control, blocked) {
    if (blocked || event.key !== " "
        || event.target.closest("input, select, textarea, button")
        || event.target.isContentEditable || event.ctrlKey || event.altKey || event.metaKey) return false;
    event.preventDefault();
    if (!event.repeat) control.toggle();
    return true;
}
