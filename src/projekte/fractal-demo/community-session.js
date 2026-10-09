export function createCommunitySession({
    client = null,
    onError = error => console.error("Community-Session:", error),
} = {}) {
    let session = null;
    let isAdmin = false;
    let revision = 0;
    let authSubscription = null;
    let startPromise = null;
    const listeners = new Set();

    function snapshot() {
        return { session, user: session?.user ?? null, isAdmin };
    }

    function notify() {
        const state = snapshot();
        for (const listener of listeners) listener(state);
    }

    function updateSession(nextSession) {
        session = nextSession;
        isAdmin = false;
        const currentRevision = ++revision;
        notify();
        const userId = session?.user?.id;
        if (!userId || !client) return;

        queueMicrotask(() => {
            if (currentRevision !== revision) return;
            client.from("profiles").select("is_admin").eq("id", userId).maybeSingle()
                .then(({ data, error }) => {
                    if (error) throw error;
                    if (currentRevision !== revision) return;
                    isAdmin = Boolean(data?.is_admin);
                    notify();
                })
                .catch(error => {
                    if (currentRevision === revision) onError(error);
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
