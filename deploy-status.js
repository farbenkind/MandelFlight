const owner = "farbenkind";
const repo = "MandelFlight";
const workflow = "deploy-pages.yml";
const workflowUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?per_page=1`;
const apiHeaders = { Accept: "application/vnd.github+json" };
const refreshButton = document.getElementById("refreshBtn");

const runStates = {
    queued: ["Warteschlange", "pending"],
    in_progress: ["Läuft", "pending"],
    completed: ["Abgeschlossen", "neutral"],
};

function setBadge(id, label, style) {
    const badge = document.getElementById(id);
    badge.textContent = label;
    badge.className = `badge ${style}`;
}

function formatDate(value) {
    if (!value) return "Zeit unbekannt";
    return new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function stateLabel(status, conclusion) {
    if (status !== "completed") return runStates[status] ?? ["Ausstehend", "pending"];
    if (conclusion === "success") return ["Erfolgreich", "success"];
    if (conclusion === "failure") return ["Fehlgeschlagen", "failure"];
    if (conclusion === "cancelled") return ["Abgebrochen", "neutral"];
    return [conclusion ?? "Abgeschlossen", "neutral"];
}

function setStep(item, name, status, conclusion) {
    const [label, style] = stateLabel(status, conclusion);
    const row = document.createElement("li");
    const title = document.createElement("span");
    title.textContent = name;
    const result = document.createElement("span");
    result.className = `step-state ${style}`;
    result.textContent = label;
    row.append(title, result);
    item.append(row);
}

async function checkLivePage() {
    const response = await fetch(`/?deploy-status-check=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Live-Seite antwortet mit HTTP ${response.status}.`);
    const html = await response.text();
    const googlePresent = html.includes('id="authGoogleBtn"');
    const githubPresent = html.includes('id="authGithubBtn"');
    return { googlePresent, githubPresent };
}

async function refreshStatus() {
    refreshButton.disabled = true;
    document.getElementById("errorMessage").textContent = "";
    document.getElementById("updatedAt").textContent = "Wird aktualisiert …";
    document.getElementById("stepsList").replaceChildren();

    try {
        const [workflowResponse, live] = await Promise.all([
            fetch(workflowUrl, { headers: apiHeaders, cache: "no-store" }),
            checkLivePage(),
        ]);
        if (!workflowResponse.ok) {
            throw new Error(`GitHub Actions API antwortet mit HTTP ${workflowResponse.status}.`);
        }

        const data = await workflowResponse.json();
        const run = data.workflow_runs?.[0];
        const pushBadge = document.getElementById("pushBadge");
        const buildBadge = document.getElementById("buildBadge");
        const deployBadge = document.getElementById("deployBadge");

        setBadge("deployBadge", live.googlePresent ? "Google-Button noch live" : "Live-Seite erreichbar", live.googlePresent ? "failure" : "success");
        document.getElementById("deploySummary").textContent = live.googlePresent
            ? "Die ausgelieferte Startseite enthält noch den Google-Button."
            : `mandelflight.pages.dev antwortet. ${live.githubPresent ? "GitHub-Login-Button ist vorhanden; Google-Button fehlt." : ""}`;

        if (!run) {
            document.getElementById("pushSummary").textContent = "Noch keine GitHub-Actions-Läufe gefunden.";
            setBadge("pushBadge", "Kein Lauf", "neutral");
            setBadge("buildBadge", "Kein Lauf", "neutral");
            document.getElementById("runSummary").textContent = "Der Workflow deploy-pages.yml hat noch keinen Lauf.";
            return;
        }

        const commitMessage = (run.head_commit?.message ?? run.display_title ?? "Commit ohne Nachricht").split("\n")[0];
        document.getElementById("pushSummary").textContent = `${commitMessage} · ${formatDate(run.created_at)}`;
        const commitLink = document.getElementById("commitLink");
        commitLink.href = `https://github.com/${owner}/${repo}/commit/${run.head_sha}`;
        commitLink.classList.remove("hidden");

        const runLink = document.getElementById("runLink");
        runLink.href = run.html_url;
        runLink.classList.remove("hidden");
        document.getElementById("runSummary").textContent =
            `${run.name} · ${run.head_branch} · ${run.head_sha.slice(0, 7)} · gestartet ${formatDate(run.run_started_at ?? run.created_at)}`;

        pushBadge.textContent = "Push erkannt";
        pushBadge.className = "badge success";

        const jobsResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}/jobs?per_page=100`,
            { headers: apiHeaders, cache: "no-store" },
        );
        if (!jobsResponse.ok) {
            throw new Error(`GitHub Actions-Details antworten mit HTTP ${jobsResponse.status}.`);
        }
        const jobsData = await jobsResponse.json();
        const steps = jobsData.jobs?.flatMap(job => job.steps ?? []) ?? [];
        steps.forEach(step => setStep(
            document.getElementById("stepsList"),
            step.name,
            step.status,
            step.conclusion,
        ));

        const testStep = steps.find(step => step.name === "Run tests");
        const buildStep = steps.find(step => step.name === "Build site");
        const deployStep = steps.find(step => step.name === "Deploy to Cloudflare Pages");
        const buildStatus = testStep?.conclusion === "failure" || buildStep?.conclusion === "failure"
            ? ["Fehlgeschlagen", "failure"]
            : testStep?.conclusion === "success" && buildStep?.conclusion === "success"
                ? ["Erfolgreich", "success"]
                : stateLabel(run.status, run.conclusion);
        buildBadge.textContent = buildStatus[0];
        buildBadge.className = `badge ${buildStatus[1]}`;
        document.getElementById("buildSummary").textContent =
            buildStatus[1] === "success"
                ? "Tests und Produktions-Build sind erfolgreich."
                : buildStatus[1] === "failure"
                    ? "Tests oder Produktions-Build sind fehlgeschlagen."
                    : "Tests und Produktions-Build warten noch oder laufen gerade.";

        const deployStatus = deployStep
            ? stateLabel(deployStep.status, deployStep.conclusion)
            : run.status === "completed" && run.conclusion !== "success"
                ? ["Nicht gestartet", "neutral"]
                : ["Wartet", "pending"];
        deployBadge.textContent = deployStatus[0];
        deployBadge.className = `badge ${deployStatus[1]}`;
        if (deployStatus[1] === "success") {
            document.getElementById("deploySummary").textContent =
                live.googlePresent
                    ? "GitHub meldet den Deploy erfolgreich, aber die Startseite enthält noch den Google-Button."
                    : "GitHub meldet den Cloudflare-Deploy erfolgreich; die Live-Seite antwortet.";
        } else if (deployStatus[1] === "failure") {
            document.getElementById("deploySummary").textContent = "Der Cloudflare-Deploy ist fehlgeschlagen. Öffne die Workflow-Details für den Fehler.";
        } else {
            document.getElementById("deploySummary").textContent = "Cloudflare wird nach erfolgreichen Tests und Build aktualisiert.";
        }
        document.getElementById("updatedAt").textContent = `Aktualisiert ${formatDate(new Date())}`;
    } catch (error) {
        document.getElementById("errorMessage").textContent =
            `${error.message} Prüfe die GitHub-Actions-Seite direkt oder versuche es später erneut.`;
        setBadge("buildBadge", "Status nicht verfügbar", "failure");
    } finally {
        refreshButton.disabled = false;
    }
}

refreshButton.addEventListener("click", refreshStatus);
void refreshStatus();
