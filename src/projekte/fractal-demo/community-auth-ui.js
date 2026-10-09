export function createCommunityAuthUI({
    communitySession,
    execute,
    onSignIn,
    onSignOut,
    onSwitchAccount,
    onStateChange,
    onError,
}) {
    const signedOut = document.getElementById("authSignedOut");
    const signedIn = document.getElementById("authSignedIn");
    const userName = document.getElementById("authUserName");
    const problemButton = document.getElementById("problemBtn");
    const configNotice = document.getElementById("communityConfigNotice");
    const landingPresetAdminControls = document.getElementById("landingPresetAdminControls");
    const accountInput = document.getElementById("authGithubAccountInput");

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
        problemButton.disabled = !user;
        onStateChange(state);
    }

    document.getElementById("authGithubBtn").addEventListener("click", () => {
        void execute(onSignIn);
    });
    document.getElementById("authSignOutBtn").addEventListener("click", () => {
        void execute(onSignOut);
    });
    document.getElementById("authSwitchAccountBtn").addEventListener("click", () => {
        const login = accountInput.value.trim();
        if (!login) {
            onError(new Error("Gib deinen GitHub-Benutzernamen oder deine GitHub-E-Mail ein."));
            accountInput.focus();
            return;
        }
        void execute(() => onSwitchAccount(login));
    });

    if (communitySession) {
        communitySession.subscribe(render);
        void communitySession.start().catch(onError);
    } else {
        configNotice.textContent =
            "Community-Login ist noch nicht eingerichtet. Die öffentlichen Presets sind nach der Supabase-Konfiguration verfügbar.";
    }
}
