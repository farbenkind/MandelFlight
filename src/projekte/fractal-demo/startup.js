import "./startup.css";

const mobileHint = document.createElement("aside");
mobileHint.className = "mobile-support-hint";
mobileHint.setAttribute("role", "note");
mobileHint.textContent = "Am besten am PC oder Laptop ausprobieren: MandelFlight ist grafikintensiv. Smartphones und Tablets werden derzeit nicht offiziell unterstuetzt.";
document.body.append(mobileHint);

try {
    await import("./main.js");
} catch (error) {
    console.error("MandelFlight konnte nicht gestartet werden:", error);
    mobileHint.remove();
    const panel = document.createElement("section");
    panel.className = "startup-error";
    panel.setAttribute("role", "alert");
    const heading = document.createElement("h1");
    heading.textContent = "MandelFlight kann hier nicht starten";
    const message = document.createElement("p");
    message.textContent = "Diese Visualisierung braucht WebGPU und ausreichend Grafikleistung. Smartphones und Tablets werden derzeit nicht offiziell unterstuetzt. Probiere MandelFlight auf deinem PC oder Laptop mit aktuellem Chrome oder Edge und aktivierter Hardwarebeschleunigung aus.";
    const details = document.createElement("p");
    details.textContent = `Technischer Hinweis: ${error instanceof Error ? error.message : String(error)}`;
    const link = document.createElement("a");
    link.href = "https://mandelflight.farbenkind.org/";
    link.textContent = "mandelflight.farbenkind.org";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Erneut versuchen";
    retry.addEventListener("click", () => location.reload());
    panel.append(heading, message, link, details, retry);
    document.body.append(panel);
    document.body.classList.add("startup-failed");
}
