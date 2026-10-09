export function createCommunityAuthUI({
    communitySession,
    execute,
    onSignIn,
    onSignOut,
    onStateChange,
    onError,
}) {
    const signedOut = document.getElementById("authSignedOut");
    const signedIn = document.getElementById("authSignedIn");
    const userName = document.getElementById("authUserName");
    const problemButton = document.getElementById("problemBtn");
    const configNotice = document.getElementById("communityConfigNotice");
    const landingPresetAdminControls = document.getElementById("landingPresetAdminControls");
    const workspace = document.getElementById("authWorkspace");
    const modeInput = document.getElementById("authWorkspaceMode");
    const workspaceStatus = document.getElementById("authWorkspaceStatus");
    let changingMode = false;

    function render(state) {
        const user = state.user;
        landingPresetAdminControls.classList.toggle("hidden", !state.isAdmin);
        signedOut.classList.toggle("hidden", Boolean(user));
        signedIn.classList.toggle("hidden", !user);
        const displayName = user?.user_metadata?.user_name
            || user?.user_metadata?.full_name
            || user?.user_metadata?.name
            || "Angemeldet";
        userName.textContent = user?.email ? `${displayName} (${user.email})` : displayName;
        workspace.classList.toggle("hidden", !user || !state.canAdmin);
        modeInput.value = state.mode ?? "user";
        modeInput.disabled = changingMode || !state.workspaceReady;
        workspaceStatus.textContent = !user
            ? "Nicht angemeldet. Speichern im Konto erfordert einen GitHub-Login."
            : !state.workspaceReady
                ? "Kontoberechtigungen werden geprueft. Speichern ist bis dahin gesperrt."
                : state.mode === "test"
                    ? "Testbenutzer · Datensatz B. Eigener Testbestand, keine Adminrechte."
                    : state.mode === "admin"
                        ? "Admin · Datensatz A. Persoenliche Presets und Verwaltungsrechte."
                        : "Benutzer · Datensatz A. Persoenliche Presets, keine Adminaktionen.";
        problemButton.disabled = !user;
        onStateChange(state);
    }

    document.getElementById("authGithubBtn").addEventListener("click", () => {
        void execute(onSignIn);
    });
    document.getElementById("authSignOutBtn").addEventListener("click", () => {
        void execute(onSignOut);
    });
    modeInput.addEventListener("change", () => {
        const mode = modeInput.value;
        void execute(async () => {
            changingMode = true;
            modeInput.disabled = true;
            try {
                await communitySession.setMode(mode);
            } finally {
                changingMode = false;
                render(communitySession.getSnapshot());
            }
        });
    });

    if (communitySession) {
        communitySession.subscribe(render);
        void communitySession.start().catch(onError);
    } else {
        document.getElementById("authGithubBtn").disabled = true;
        document.getElementById("authSignOutBtn").disabled = true;
        modeInput.disabled = true;
        configNotice.textContent =
            "Community-Login ist noch nicht eingerichtet. Die öffentlichen Presets sind nach der Supabase-Konfiguration verfügbar.";
    }
}
