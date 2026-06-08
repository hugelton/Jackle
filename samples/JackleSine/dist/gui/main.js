(() => {
  let context = null;
  let node = null;
  let state = {
  "version": 1,
  "parameters": {
    "frequency": 440,
    "level": 0.25
  }
};
  const midiEnabled = false;

  const sendState = () => {
    if (node) node.port.postMessage({ type: "state", state });
    window.JackleBridge.setState(state);
  };

  async function start() {
    if (context) {
      await context.resume();
      return;
    }
    context = new AudioContext();
    await context.audioWorklet.addModule("../web/worklet.js");
    node = new AudioWorkletNode(context, "jackle-processor", {
      outputChannelCount: [2]
    });
    node.connect(context.destination);
    node.port.onmessage = (event) => {
      if (event.data?.type === "status") {
        window.JackleBridge.setStatus(event.data.message);
      }
    };
    const wasmResponse = await fetch("../web/jackle-dsp.wasm");
    if (!wasmResponse.ok) {
      throw new Error("Could not load WASM: HTTP " + wasmResponse.status);
    }
    const wasmBinary = await wasmResponse.arrayBuffer();
    node.port.postMessage({ type: "wasm", wasmBinary }, [wasmBinary]);
    window.addEventListener("jackle-gui-parameter", (event) => {
      state.parameters[event.detail.id] = event.detail.value;
      node.port.postMessage({
        type: "parameter",
        id: event.detail.id,
        value: event.detail.value
      });
    });
    if (midiEnabled) {
      window.addEventListener("jackle-gui-note", (event) => {
        node.port.postMessage(event.detail);
        window.JackleBridge.receiveNote(
          event.detail.note,
          event.detail.type === "noteOn"
        );
      });
      await connectWebMidi();
    }
    sendState();
    await context.resume();
  }

  async function connectWebMidi() {
    const status = document.querySelector("#jackle-midi-status");
    if (!navigator.requestMIDIAccess) {
      if (status) status.textContent = "Web MIDI unavailable";
      return;
    }
    try {
      const access = await navigator.requestMIDIAccess();
      const connectInputs = () => {
        for (const input of access.inputs.values()) {
          input.onmidimessage = (event) => {
            const command = event.data[0] & 0xf0;
            const note = event.data[1];
            const velocity = event.data[2] / 127;
            if (command === 0x90 && velocity > 0) {
              node.port.postMessage({ type: "noteOn", note, velocity });
              window.JackleBridge.receiveNote(note, true);
            } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
              node.port.postMessage({ type: "noteOff", note });
              window.JackleBridge.receiveNote(note, false);
            }
          };
        }
        if (status) {
          status.textContent = access.inputs.size
            ? "Web MIDI connected"
            : "Web MIDI ready";
        }
      };
      access.onstatechange = connectInputs;
      connectInputs();
    } catch {
      if (status) status.textContent = "Web MIDI permission denied";
    }
  }

  function getState() {
    return structuredClone(state);
  }

  function setState(nextState) {
    if (!nextState || nextState.version !== 1 || !nextState.parameters) {
      throw new Error("Invalid Jackle state");
    }
    state = structuredClone(nextState);
    sendState();
  }

  window.JackleWeb = { start, getState, setState };
})();
