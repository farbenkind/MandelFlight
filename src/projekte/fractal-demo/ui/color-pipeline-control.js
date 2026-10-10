export function createColorPipelineControl({ root, colorPipeline, onChange }) {
    const container = document.createElement("div");
    const label = document.createElement("span");
    const button = document.createElement("button");
    button.id = "upgradeColorPipelineBtn";
    button.textContent = "Neuen Farbstil verwenden";
    button.title = "Wechselt bewusst zum dreamy Pastel-Look. Das gespeicherte Preset bleibt unveraendert.";
    container.append(label, button);
    root.append(container);
    function refresh() {
        const legacy = colorPipeline.getVersion() === 1;
        label.textContent = legacy ? "Farbstil: bisherig (Preset-kompatibel) " : "Farbstil: Dreamy + Contrast";
        button.hidden = !legacy;
    }
    button.addEventListener("click", () => {
        if (!window.confirm("Zum neuen Pastel-Look wechseln? Die Farben koennen sich aendern. Das gespeicherte Preset bleibt unveraendert.")) return;
        colorPipeline.setVersion(2);
        refresh();
        onChange();
    });
    refresh();
    return { refresh };
}
