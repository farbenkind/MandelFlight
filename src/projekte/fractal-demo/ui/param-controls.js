import { symExp } from "../util.js";

export function createParamControls(params) {
    const wrap = document.createElement("div");
    wrap.className = "param-controls";
    for (const [key, param] of Object.entries(params)) {
        const label = document.createElement("label");
        label.className = "param-control";
        const heading = document.createElement("span");
        heading.className = "param-control-heading";
        const title = document.createElement("span");
        title.textContent = param.label ?? key;
        heading.append(title);
        label.append(heading);

        if (param.ui === "slider") {
            const input = document.createElement("input");
            input.type = "range";
            input.min = 0;
            input.max = 1;
            input.step = param.step ?? 0.005;
            const exponent = param.exp ? symExp(param.max) : 1;
            const range = (param.max - param.min) || 1;
            input.value = Math.pow(Math.max(0, Math.min(1, (param.value - param.min) / range)), 1 / exponent);
            const value = document.createElement("output");
            value.textContent = param.value.toFixed(3);
            heading.append(value);
            input.addEventListener("input", () => {
                param.value = param.min + Math.pow(Number(input.value), exponent) * range;
                value.textContent = param.value.toFixed(3);
            });
            label.append(input);
        } else if (param.ui === "select") {
            const select = document.createElement("select");
            param.options.forEach((option, index) => {
                const text = typeof option === "object" ? option.label : String(option);
                select.append(new Option(text, String(index)));
            });
            const optionValue = option => typeof option === "object" ? option.value : option;
            select.selectedIndex = param.options.findIndex(option => optionValue(option) === param.value);
            select.addEventListener("change", () => {
                param.value = optionValue(param.options[select.selectedIndex]);
            });
            label.append(select);
        } else if (param.ui === "checkbox") {
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = param.value;
            input.addEventListener("change", () => { param.value = input.checked; });
            label.classList.add("param-checkbox");
            label.append(input);
        } else {
            const message = `Unsupported parameter UI "${param.ui}" for "${key}"`;
            console.error(message);
            const error = document.createElement("span");
            error.className = "param-control-error";
            error.textContent = message;
            label.append(error);
        }
        wrap.append(label);
    }
    return wrap;
}
