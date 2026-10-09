import { supabase } from "./supabase-client.js";
import { submitProblem } from "./problem-report-store.js";

const popup = document.getElementById("problemPopup");
const form = document.getElementById("problemForm");
const status = document.getElementById("problemStatus");
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
let turnstileWidget = null;
let turnstileToken = "";
let turnstileReady;

function loadTurnstile() {
    if (!turnstileSiteKey) return Promise.resolve();
    if (window.turnstile) return Promise.resolve();
    if (!turnstileReady) {
        turnstileReady = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.async = true;
            script.defer = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error("Turnstile konnte nicht geladen werden."));
            document.head.append(script);
        });
    }
    return turnstileReady;
}

async function verifyTurnstile(token) {
    const response = await fetch("/api/turnstile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || `Turnstile-Verifizierung fehlgeschlagen (HTTP ${response.status}).`);
    }
    if (result.success !== true) throw new Error("Turnstile-Token konnte nicht bestaetigt werden.");
}

function parseBrowser(ua) {
    if (/Edg\//.test(ua)) return "Edge";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Chrome\//.test(ua)) return "Chrome";
    if (/Safari\//.test(ua)) return "Safari";
    return "Unbekannt";
}

function getOperatingSystem() {
    return navigator.userAgentData?.platform || navigator.platform || "Unbekannt";
}

export function createProblemReport({ getCurrentPresetId, getSession }) {
    document.getElementById("problemBtn").addEventListener("click", async () => {
        if (!getSession()) {
            status.textContent = "Zum Melden eines Problems bitte zuerst anmelden.";
            return;
        }
        form.reset();
        status.textContent = "";
        turnstileToken = "";
        popup.classList.remove("hidden");
        document.getElementById("problemTitle").focus();
        if (turnstileSiteKey) {
            try {
                await loadTurnstile();
                const container = document.getElementById("problemTurnstile");
                if (turnstileWidget === null) {
                    turnstileWidget = window.turnstile.render(container, {
                        sitekey: turnstileSiteKey,
                        callback: token => { turnstileToken = token; },
                        "expired-callback": () => { turnstileToken = ""; },
                        "error-callback": () => { turnstileToken = ""; },
                    });
                } else {
                    window.turnstile.reset(turnstileWidget);
                }
            } catch (error) {
                status.textContent = error.message;
            }
        }
    });
    document.getElementById("problemCloseBtn").addEventListener("click", () => popup.classList.add("hidden"));
    popup.addEventListener("keydown", event => {
        if (event.key === "Escape") popup.classList.add("hidden");
    });
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!getSession() || !supabase) {
            status.textContent = "Zum Melden eines Problems bitte anmelden und Supabase konfigurieren.";
            return;
        }
        const submit = document.getElementById("problemSubmitBtn");
        submit.disabled = true;
        status.textContent = "Bericht wird gesendet ...";
        try {
            if (turnstileSiteKey) {
                if (!turnstileToken) throw new Error("Bitte zuerst die Turnstile-Prüfung abschliessen.");
                await verifyTurnstile(turnstileToken);
            }
            const userAgent = navigator.userAgent;
            await submitProblem({
                title: document.getElementById("problemTitle").value.trim(),
                description: document.getElementById("problemDescription").value.trim(),
                category: document.getElementById("problemCategory").value,
                appVersion: document.querySelector('meta[name="app-version"]')?.content || "dev",
                browser: `${parseBrowser(userAgent)} (${userAgent})`.slice(0, 500),
                operatingSystem: getOperatingSystem().slice(0, 200),
                occurredAt: new Date().toISOString(),
                presetId: getCurrentPresetId(),
            });
            status.textContent = "Danke! Dein Problembericht wurde gesendet.";
            form.reset();
            turnstileToken = "";
            if (turnstileWidget !== null) window.turnstile.reset(turnstileWidget);
        } catch (error) {
            console.error("Problembericht:", error);
            status.textContent = error.message;
            if (turnstileWidget !== null) window.turnstile.reset(turnstileWidget);
            turnstileToken = "";
        } finally {
            submit.disabled = false;
        }
    });
}
