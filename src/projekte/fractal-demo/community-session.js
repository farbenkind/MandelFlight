export function createCommunitySession({
    client = null,
    onError = error => console.error("Community-Session:", error),
} = {}) {
    let session = null;
    let isAdmin = false;
    let canAdmin = false;
    let workspaceReady = false;
    let revision = 0;
    let authSubscription = null;
    let startPromise = null;
    const listeners = new Set();

    function snapshot() {
        return {
            session, user: session?.user ?? null, isAdmin, canAdmin, workspaceReady,
            mode: getWorkspaceMode(), dataset: getWorkspaceDataset(),
        };
    }

    function notify() {
        const state = snapshot();
        for (const listener of listeners) listener(state);
    }

    function updateSession(nextSession) {
        const identityChanged = session?.user?.id !== nextSession?.user?.id;
        session = nextSession;
        setWorkspaceUser(session?.user?.id);
        isAdmin = false;
        canAdmin = false;
        workspaceReady = false;
        if (identityChanged) setWorkspaceMode("user");
        const currentRevision = ++revision;
        notify();
        const userId = session?.user?.id;
        if (!userId || !client) return;

        queueMicrotask(() => {
            if (currentRevision !== revision) return;
            scopeWorkspaceRequest(client.rpc("get_workspace_access"))
                .then(({ data, error }) => {
                    if (error) throw error;
                    if (currentRevision !== revision) return;
                    canAdmin = Boolean(data?.can_admin);
                    workspaceReady = true;
                    if (!canAdmin) setWorkspaceMode("user");
                    isAdmin = canAdmin && getWorkspaceMode() === "admin";
                    notify();
                })
                .catch(error => {
                    if (currentRevision === revision) {
                        setWorkspaceMode("user");
                        notify();
                        onError(error);
                    }
                });
        });
    }

    function start() {
        if (!client) return Promise.resolve();
        if (startPromise) return startPromise;
        authSubscription = client.auth.onAuthStateChange((_event, nextSession) => {
            updateSession(nextSession);
        }).data.subscription;

        const initialRevision = revision;
        startPromise = client.auth.getSession().then(({ data, error }) => {
            if (error) throw error;
            if (initialRevision === revision) updateSession(data?.session ?? null);
        }).catch(error => {
            onError(error);
        });
        return startPromise;
    }

    return {
        getSession: () => session,
        getSnapshot: snapshot,
        async setMode(mode) {
            if (!workspaceReady || !session?.user) throw new Error("Arbeitsmodus ist noch nicht bereit.");
            if (mode !== "user" && !canAdmin) throw new Error("Nur berechtigte Admins koennen diesen Modus verwenden.");
            const request = ++revision;
            setWorkspaceMode(mode);
            isAdmin = false;
            workspaceReady = false;
            notify();
            try {
                const { data, error } = await scopeWorkspaceRequest(client.rpc("get_workspace_access"));
                if (error) throw new Error(error.message);
                if (request !== revision) throw new Error("Anmeldung hat sich waehrend des Moduswechsels geaendert.");
                canAdmin = Boolean(data?.can_admin);
                if (mode !== "user" && !canAdmin) throw new Error("Adminberechtigung ist nicht mehr verfuegbar.");
                workspaceReady = true;
                isAdmin = canAdmin && mode === "admin";
                notify();
            } catch (error) {
                if (request === revision) {
                    setWorkspaceMode("user");
                    workspaceReady = true;
                    isAdmin = false;
                    notify();
                }
                throw error;
            }
        },
        subscribe(listener) {
            listeners.add(listener);
            listener(snapshot());
            return () => listeners.delete(listener);
        },
        start,
        dispose() {
            revision++;
            authSubscription?.unsubscribe();
            authSubscription = null;
            startPromise = null;
            listeners.clear();
        },
    };
}
import { getWorkspaceMode, getWorkspaceDataset, setWorkspaceMode, setWorkspaceUser, scopeWorkspaceRequest } from "./community-workspace.js";
