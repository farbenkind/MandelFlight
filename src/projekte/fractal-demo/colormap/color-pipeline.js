export const CURRENT_COLOR_PIPELINE_VERSION = 2;

export function readColorPipelineVersion(version) {
    if (version === undefined) return 1;
    if (version !== 1 && version !== 2) {
        throw new Error(`Unbekannte Farbpipeline-Version: ${version}`);
    }
    return version;
}

export function createColorPipeline() {
    let version = CURRENT_COLOR_PIPELINE_VERSION;
    return {
        getVersion: () => version,
        setVersion(value) { version = readColorPipelineVersion(value); },
    };
}
