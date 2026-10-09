export async function onRequestPost({ request, env }) {
    if (!env.TURNSTILE_SECRET_KEY) {
        return Response.json({ error: "Turnstile ist auf dem Server nicht konfiguriert." }, { status: 503 });
    }
    let token;
    try {
        ({ token } = await request.json());
    } catch {
        return Response.json({ error: "Ungueltige Anfrage." }, { status: 400 });
    }
    if (typeof token !== "string" || token.length < 1 || token.length > 2048) {
        return Response.json({ error: "Turnstile-Token fehlt oder ist ungueltig." }, { status: 400 });
    }
    const form = new FormData();
    form.set("secret", env.TURNSTILE_SECRET_KEY);
    form.set("response", token);
    const remoteip = request.headers.get("CF-Connecting-IP");
    if (remoteip) form.set("remoteip", remoteip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: form,
    });
    if (!response.ok) {
        return Response.json({ error: "Turnstile-Verifizierung fehlgeschlagen." }, { status: 502 });
    }
    const result = await response.json();
    const allowed = (env.TURNSTILE_HOSTNAMES || "").split(",").map(value => value.trim()).filter(Boolean);
    const requestHostname = new URL(request.url).hostname;
    if (!result.success || (allowed.length ? !allowed.includes(result.hostname) : result.hostname !== requestHostname)) {
        return Response.json({ error: "Turnstile hat die Anfrage abgelehnt." }, {
            status: 403,
            headers: { "cache-control": "no-store" },
        });
    }
    return Response.json({ success: true }, { headers: { "cache-control": "no-store" } });
}
