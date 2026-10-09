export function createPresetWorkspaceState() {
    let key = null;
    let generation = 0;
    let ready = false;
    return {
        update(state) {
            const nextKey = `${state.user?.id ?? ""}:${state.mode ?? "user"}`;
            const changed = key !== nextKey || ready !== Boolean(state.workspaceReady);
            key = nextKey;
            ready = Boolean(state.workspaceReady);
            if (changed) generation++;
            return changed;
        },
        ticket() { return generation; },
        assert(ticket) {
            if (ticket !== generation) throw new Error("Konto oder Arbeitsmodus hat sich geaendert. Aktion bitte erneut starten.");
        },
        get ready() { return ready; },
    };
}
