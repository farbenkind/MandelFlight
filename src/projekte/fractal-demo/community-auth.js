import { supabase } from "./supabase-client.js";

export function getSupabaseClient() {
    if (!supabase) throw new Error("Supabase ist nicht konfiguriert. Bitte die VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY setzen.");
    return supabase;
}

export async function signIn(provider, { login } = {}) {
    const db = getSupabaseClient();
    const options = {
        redirectTo: window.location.origin + window.location.pathname,
    };
    if (login) {
        options.queryParams = {
            login,
            prompt: "login",
        };
    }
    const { error } = await db.auth.signInWithOAuth({
        provider,
        options,
    });
    if (error) throw new Error(error.message);
}

export async function signOut() {
    const { error } = await getSupabaseClient().auth.signOut({ scope: "local" });
    if (error) throw new Error(error.message);
}

export async function updateDisplayName(userId, displayName) {
    const { error } = await getSupabaseClient().from("profiles")
        .update({ display_name: displayName }).eq("id", userId);
    if (error) throw new Error(error.message);
}
