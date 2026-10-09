function makePreview(entry, document) {
    const preview = document.createElement("div");
    preview.className = "community-preset-preview";
    const colors = entry.preview_palette ?? {};
    const amount = key => {
        const value = colors[key];
        return Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value * 255))) : 70;
    };
    preview.style.setProperty("--preview-a", `rgb(${amount("amount-r")}, ${amount("amount-g")}, ${amount("amount-b")})`);
    preview.style.setProperty("--preview-b", `hsl(${Math.round((Number.isFinite(colors.phaseShift) ? colors.phaseShift : 0) * 360)}, 85%, 48%)`);
    preview.setAttribute("aria-label", "Farbvorschau des Presets");
    return preview;
}

export function createCommunityPresetCard(entry, actions, document = globalThis.document) {
    const card = document.createElement("article");
    card.className = "community-preset-card";
    card.append(makePreview(entry, document));

    const heading = document.createElement("div");
    heading.className = "community-preset-heading";
    const title = document.createElement("h3");
    title.textContent = entry.name;
    heading.append(title);
    if (entry.featured) {
        const badge = document.createElement("span");
        badge.className = "featured-badge";
        badge.textContent = "★ Featured";
        heading.append(badge);
    }
    card.append(heading);

    const author = document.createElement("p");
    author.className = "community-preset-author";
    author.textContent = `von ${entry.profiles?.display_name || "MandelFlight User"}`;
    card.append(author);
    if (entry.description) {
        const description = document.createElement("p");
        description.className = "community-preset-description";
        description.textContent = entry.description;
        card.append(description);
    }
    const stats = document.createElement("p");
    stats.className = "community-preset-stats";
    stats.textContent = `❤️ ${entry.likes}   👁 ${entry.views}   📦 ${entry.saves}`;
    card.append(stats, actions);
    return card;
}

export function createLocalPresetCard(preset, importButton, document = globalThis.document) {
    const card = document.createElement("article");
    card.className = "community-preset-card legacy-preset";
    const title = document.createElement("h3");
    title.textContent = preset.name;
    const note = document.createElement("p");
    note.textContent = "Lokales Legacy-Preset – nach Anmeldung in My Presets importierbar.";
    card.dataset.localName = preset.name;
    card.append(title, note, importButton);
    return card;
}
