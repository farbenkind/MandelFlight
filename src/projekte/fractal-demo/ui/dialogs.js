const alertPopup = document.getElementById("alertPopup");
const alertMessage = document.getElementById("alertMsg");
document.getElementById("alertBtn").onclick = () => alertPopup.classList.add("hidden");
export function openAlert(msg = "") {
    alertMessage.textContent = msg
    alertPopup.classList.remove("hidden")
}

const yesNoDialog = document.getElementById("yesNoDialog");
const yesNoMessage = document.getElementById("yesNoMessage");
const yesBtn = document.getElementById("yesBtn");
const noBtn = document.getElementById("noBtn");

export function openYesNo(msg) {
    return new Promise(resolve => {
        yesNoMessage.textContent = msg;
        yesNoDialog.classList.remove("hidden");

        const onYes = () => {
            cleanup();
            resolve("yes");
        };
        const onNo = () => {
            cleanup();
            resolve("no");
        };

        function cleanup() {
            yesNoDialog.classList.add("hidden");
            yesBtn.removeEventListener("click", onYes);
            noBtn.removeEventListener("click", onNo);
        }

        yesBtn.addEventListener("click", onYes);
        noBtn.addEventListener("click", onNo);
    });
}
