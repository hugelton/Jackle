(() => {
  const status = () => document.querySelector("#jackle-status");
  let webTargetReady = null;

  const postNative = (message) => {
    const handler = window.webkit?.messageHandlers?.jackle;
    if (handler) {
      handler.postMessage(message);
      return true;
    }
    return false;
  };

  const loadWebTarget = () => {
    if (!webTargetReady) {
      webTargetReady = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "../web/main.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Could not load the browser target"));
        document.head.appendChild(script);
      });
    }
    return webTargetReady;
  };

  window.JackleBridge = {
    setParameter(id, value) {
      if (!postNative({ type: "parameter", id, value })) {
        window.dispatchEvent(new CustomEvent("jackle-gui-parameter", {
          detail: { id, value }
        }));
      }
    },
    sendNoteOn(note, velocity = 1) {
      if (!postNative({ type: "noteOn", note, velocity })) {
        window.dispatchEvent(new CustomEvent("jackle-gui-note", {
          detail: { type: "noteOn", note, velocity }
        }));
      }
    },
    sendNoteOff(note) {
      if (!postNative({ type: "noteOff", note })) {
        window.dispatchEvent(new CustomEvent("jackle-gui-note", {
          detail: { type: "noteOff", note }
        }));
      }
    },
    receiveNote(note, active) {
      const display = document.querySelector("#jackle-note");
      if (display) display.textContent = active ? midiNoteName(note) : "None";
    },
    receiveParameter(id, value) {
      window.dispatchEvent(new CustomEvent("jackle-parameter", {
        detail: { id, value }
      }));
    },
    setState(state) {
      window.dispatchEvent(new CustomEvent("jackle-state", { detail: state }));
    },
    getState() {
      return window.JackleWeb?.getState?.() || null;
    },
    ready() {
      postNative({ type: "ready" });
    },
    setStatus(message) {
      const target = status();
      if (target) target.textContent = message;
    }
  };

  if (!window.__JACKLE_NATIVE__) {

    const overlay = document.createElement("button");
    overlay.type = "button";
    overlay.className = "jackle-start-overlay";
    overlay.textContent = "Click to start audio";
    overlay.addEventListener("click", async () => {
      overlay.disabled = true;
      window.JackleBridge.setStatus("Starting audio...");
      try {
        await loadWebTarget();
        await window.JackleWeb.start();
        overlay.remove();
        window.JackleBridge.setStatus("WASM audio running");
      } catch (error) {
        overlay.disabled = false;
        window.JackleBridge.setStatus(error.message);
      }
    });
    document.body.appendChild(overlay);
  }

  function midiNoteName(note) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return names[note % 12] + String(Math.floor(note / 12) - 1);
  }
})();
