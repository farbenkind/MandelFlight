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

    function render(state) {
        const user = state.user;
        landingPresetAdminControls.classList.toggle("hidden", !state.isAdmin);
        signedOut.classList.toggle("hidden", Boolean(user));
        signedIn.classList.toggle("hidden", !user);
        userName.textContent =
            user?.user_metadata?.full_name
            || user?.user_metadata?.name
            || user?.email
            || "Angemeldet";
        problemButton.disabled = !user;
        onStateChange(state);
    }

    document.getElementById("authGithubBtn").addEventListener("click", () => {
        void execute(onSignIn);
    });
    document.getElementById("authSignOutBtn").addEventListener("click", () => {
        void execute(onSignOut);
    });

    if (communitySession) {
        communitySession.subscribe(render);
        void communitySession.start().catch(onError);
    } else {
        configNotice.textContent =
            "Community-Login ist noch nicht eingerichtet. Die öffentlichen Presets sind nach der Supabase-Konfiguration verfügbar.";
    }
}
