(() => {
  const parameters = [
  {
    "id": "frequency",
    "param_id": 800267265,
    "name": "Frequency",
    "type": "float",
    "min": 20,
    "max": 2000,
    "default": 440,
    "step": 1,
    "unit": "Hz"
  },
  {
    "id": "level",
    "param_id": 2610554845,
    "name": "Level",
    "type": "float",
    "min": 0,
    "max": 1,
    "default": 0.25,
    "step": 0.01,
    "unit": ""
  }
];
  const container = document.querySelector("#jackle-parameters");
  const controls = new Map();

  const plainValue = (param, control) =>
    param.type === "bool" ? control.checked : Number(control.value);

  const formatValue = (param, value) => {
    if (param.type === "bool") return value ? "On" : "Off";
    const numeric = Number(value);
    const text = Math.abs(numeric) >= 100 ? numeric.toFixed(0) : numeric.toFixed(2);
    return param.unit ? text + " " + param.unit : text;
  };

  const setControl = (param, value) => {
    const entry = controls.get(param.id);
    if (!entry) return;
    if (param.type === "bool") entry.control.checked = Boolean(value);
    else entry.control.value = String(value);
    entry.output.textContent = formatValue(param, value);
  };

  for (const param of parameters) {
    const row = document.createElement("label");
    row.className = "parameter";
    const name = document.createElement("span");
    name.textContent = param.name;
    const control = document.createElement("input");
    control.dataset.param = param.id;
    control.type = param.type === "bool" ? "checkbox" : "range";
    if (param.type === "float") {
      control.min = String(param.min);
      control.max = String(param.max);
      control.step = String(param.step);
      control.value = String(param.default);
    } else {
      control.checked = Boolean(param.default);
    }
    const output = document.createElement("output");
    controls.set(param.id, { control, output });
    setControl(param, param.default);
    control.addEventListener("input", () => {
      const value = plainValue(param, control);
      output.textContent = formatValue(param, value);
      window.JackleBridge.setParameter(param.id, value);
    });
    row.append(name, control, output);
    container.appendChild(row);
  }

  window.addEventListener("jackle-parameter", (event) => {
    const param = parameters.find((item) => item.id === event.detail.id);
    if (param) setControl(param, event.detail.value);
  });

  window.addEventListener("jackle-state", (event) => {
    for (const param of parameters) {
      if (Object.hasOwn(event.detail.parameters || {}, param.id)) {
        setControl(param, event.detail.parameters[param.id]);
      }
    }
  });

  window.JackleBridge.ready();
})();
