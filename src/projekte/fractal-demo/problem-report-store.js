import { supabase } from "./supabase-client.js";

function client() {
    if (!supabase) throw new Error("Community ist noch nicht konfiguriert. Supabase-URL und Anon-Key fehlen.");
    return supabase;
}

export async function submitProblem(problem, captchaToken) {
    const { error } = await client().from("problem_reports").insert({
        title: problem.title,
        description: problem.description,
        category: problem.category,
        app_version: problem.appVersion,
        browser: problem.browser,
        operating_system: problem.operatingSystem,
        occurred_at: problem.occurredAt,
        preset_id: problem.presetId,
        captcha_token: captchaToken || null,
    });
    if (error) throw new Error(error.message);
}
