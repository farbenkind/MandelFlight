const MAX_DIMENSION = 320;
const MAX_DATA_LENGTH = 60000;

export function isPresetThumbnail(thumbnail) {
    return Boolean(thumbnail && Number.isInteger(thumbnail.width) && Number.isInteger(thumbnail.height)
        && thumbnail.width > 0 && thumbnail.width <= MAX_DIMENSION
        && thumbnail.height > 0 && thumbnail.height <= MAX_DIMENSION
        && typeof thumbnail.dataUrl === "string" && thumbnail.dataUrl.length <= MAX_DATA_LENGTH
        && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(thumbnail.dataUrl));
}

export function capturePresetThumbnail(canvas, document = globalThis.document) {
    const bounds = canvas.getBoundingClientRect();
    if (canvas.width <= 0 || canvas.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
        throw new Error("Die Visualisierung ist fuer ein Vorschaubild nicht bereit.");
    }
    const scale = MAX_DIMENSION / Math.max(bounds.width, bounds.height);
    const image = document.createElement("canvas");
    image.width = Math.max(1, Math.round(bounds.width * scale));
    image.height = Math.max(1, Math.round(bounds.height * scale));
    const context = image.getContext("2d");
    if (!context) throw new Error("Vorschaubild konnte nicht erstellt werden: Canvas nicht verfuegbar.");
    context.drawImage(canvas, 0, 0, image.width, image.height);
    const thumbnail = { width: image.width, height: image.height, dataUrl: image.toDataURL("image/jpeg", 0.75) };
    if (!isPresetThumbnail(thumbnail)) {
        throw new Error("Vorschaubild ist ungueltig oder zu gross. Preset wurde nicht gespeichert.");
    }
    return thumbnail;
}
