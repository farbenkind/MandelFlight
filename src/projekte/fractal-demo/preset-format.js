import { cmapSections } from "./colormap/params.js";
import { CURRENT_COLOR_PIPELINE_VERSION, readColorPipelineVersion } from "./colormap/color-pipeline.js";

export function isVisualizationPreset(preset) {
    return Boolean(preset && typeof preset === "object")
        && (preset.kind === undefined || preset.kind === "visualization" || preset.kind === "visual");
}

export function buildVisualizationPreset(name, view, knobs, xlut, colorPipelineVersion = CURRENT_COLOR_PIPELINE_VERSION) {
    const section = id => Object.fromEntries(cmapSections.find(s => s.id === id)
        .panels.flatMap(p => p.knobs).filter(param => knobs[param.id] !== undefined)
        .map(param => [param.id, knobs[param.id]]));
    return {
        schemaVersion: 1,
        colorPipelineVersion: readColorPipelineVersion(colorPipelineVersion),
        kind: "visual",
        geometry: { fractal: { ...view } },
        color: {
            knobs: { ...section("primCmap"), ...section("xCmap") },
            xlut,
        },
        post: { knobs: section("miscCmap") },
    };
}

export function readVisualizationPreset(preset) {
    if (!isVisualizationPreset(preset)) throw new Error("Kein Visualisierungs-Preset.");
    const colorPipelineVersion = readColorPipelineVersion(preset.colorPipelineVersion);
    let view, knobs, xlut;
    if (preset.schemaVersion === 1 && preset.kind === "visual") {
        if (!preset.geometry?.fractal || !preset.color?.knobs || !preset.post?.knobs) {
            throw new Error("Preset-Schichten fehlen.");
        }
        view = preset.geometry.fractal;
        knobs = { ...preset.color.knobs, ...preset.post.knobs };
        xlut = preset.color.xlut;
    } else if (preset.version === 2) {
        const modules = preset.modules;
        if (!modules?.fractal || !modules.cmap?.knobs || !modules.xcmap?.knobs || !modules.misc?.knobs) {
            throw new Error("Preset-Module fehlen.");
        }
        view = modules.fractal;
        knobs = { ...modules.cmap.knobs, ...modules.xcmap.knobs, ...modules.misc.knobs };
        xlut = modules.xcmap.xlut;
    } else if (preset.version === undefined || preset.version === 1) {
        view = { ...preset.fractalParams, maxIter: preset.fractalParams?.iter };
        knobs = preset.knobs;
        xlut = preset.xlut;
    } else {
        throw new Error(`Unbekannte Preset-Version: ${preset.version}`);
    }
    if (!knobs || !["centerX", "centerY", "zoom", "maxIter"].every(key => Number.isFinite(view?.[key]))
        || view.zoom <= 0 || view.maxIter < 1) {
        throw new Error("Ungueltige Fraktal- oder Knobdaten im Preset.");
    }
    return { view, knobs, xlut, colorPipelineVersion };
}
