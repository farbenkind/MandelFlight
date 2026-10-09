import { test } from "node:test";
import assert from "node:assert/strict";
import { createCommunityPresetCard, createLocalPresetCard } from "./preset-card.js";

const document = {
    createElement(tagName) {
        return {
            tagName,
            children: [],
            attributes: new Map(),
            dataset: {},
            style: {
                properties: new Map(),
                setProperty(name, value) { this.properties.set(name, value); },
            },
            append(...children) { this.children.push(...children); },
            setAttribute(name, value) { this.attributes.set(name, value); },
        };
    },
};

test("community cards preserve metadata, preview, stats and supplied action elements", () => {
    const actions = document.createElement("div");
    const card = createCommunityPresetCard({
        name: "<b>Visual</b>",
        description: "<script>not markup</script>",
        profiles: { display_name: "Author" },
        featured: true,
        likes: 4,
        views: 12,
        saves: 2,
        preview_palette: { "amount-r": 1.5, "amount-g": -0.5, "amount-b": 0.5, phaseShift: 0.25 },
    }, actions, document);

    assert.equal(card.tagName, "article");
    assert.equal(card.className, "community-preset-card");
    const [preview, heading, author, description, stats, actionContainer] = card.children;
    assert.equal(preview.className, "community-preset-preview");
    assert.equal(preview.style.properties.get("--preview-a"), "rgb(255, 0, 128)");
    assert.equal(preview.style.properties.get("--preview-b"), "hsl(90, 85%, 48%)");
    assert.equal(preview.attributes.get("aria-label"), "Farbvorschau des Presets");
    assert.equal(heading.className, "community-preset-heading");
    assert.equal(heading.children[0].textContent, "<b>Visual</b>");
    assert.equal(heading.children[1].className, "featured-badge");
    assert.equal(author.textContent, "von Author");
    assert.equal(description.textContent, "<script>not markup</script>");
    assert.equal(stats.textContent, "❤️ 4   👁 12   📦 2");
    assert.equal(actionContainer, actions);
});

test("unfeatured cards retain missing-metadata and nonfinite-preview fallbacks", () => {
    const actions = document.createElement("div");
    const card = createCommunityPresetCard({
        name: "Visual",
        featured: false,
        likes: 0,
        views: 0,
        saves: 0,
        preview_palette: { "amount-r": NaN, phaseShift: Infinity },
    }, actions, document);

    const [preview, heading, author, stats, actionContainer] = card.children;
    assert.equal(card.children.length, 5);
    assert.equal(heading.children.length, 1);
    assert.equal(author.textContent, "von MandelFlight User");
    assert.equal(preview.style.properties.get("--preview-a"), "rgb(70, 70, 70)");
    assert.equal(preview.style.properties.get("--preview-b"), "hsl(0, 85%, 48%)");
    assert.equal(stats.className, "community-preset-stats");
    assert.equal(actionContainer, actions);
});

test("local cards show device origin and retain supplied actions and local-name identity", () => {
    const importButton = document.createElement("button");
    const card = createLocalPresetCard({ name: "Legacy" }, importButton, document);
    assert.equal(card.className, "community-preset-card legacy-preset");
    assert.equal(card.dataset.localName, "Legacy");
    assert.equal(card.children[0].textContent, "Legacy");
    assert.equal(card.children[1].textContent,
        "Auf diesem Geraet · Nur in diesem Browser auf dieser Domain. Kein Cloud-Backup.");
    assert.equal(card.children[2], importButton);
});
