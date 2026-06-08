import createJackleModule from "./jackle-dsp.js";

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
const byId = new Map(parameters.map((param) => [param.id, param]));

class JackleProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.processBlock = null;
    this.setParameter = null;
    this.noteOn = null;
    this.noteOff = null;
    this.outputPointer = 0;
    this.outputCapacity = 0;
    this.pending = new Map(parameters.map((param) => [param.id, param.default]));
    this.pendingNotes = [];
    this.port.onmessage = (event) => this.receive(event.data);
  }

  async load(wasmBinary) {
    try {
      this.module = await createJackleModule({
        wasmBinary,
        locateFile: (name) => name
      });
      this.module._jackle_prepare(sampleRate, 128);
      this.processBlock = this.module._jackle_process;
      this.setParameter = this.module._jackle_set_parameter;
      this.noteOn = this.module._jackle_note_on;
      this.noteOff = this.module._jackle_note_off;
      for (const [id, value] of this.pending) this.applyParameter(id, value);
      for (const note of this.pendingNotes) this.applyNote(note);
      this.pendingNotes.length = 0;
      this.port.postMessage({ type: "status", message: "WASM DSP ready" });
    } catch (error) {
      this.port.postMessage({
        type: "status",
        message: "WASM load failed: " + error.message
      });
    }
  }

  receive(message) {
    if (message?.type === "parameter") {
      this.pending.set(message.id, message.value);
      this.applyParameter(message.id, message.value);
    } else if (message?.type === "state") {
      for (const [id, value] of Object.entries(message.state.parameters || {})) {
        this.pending.set(id, value);
        this.applyParameter(id, value);
      }
    } else if (message?.type === "wasm" && message.wasmBinary) {
      this.load(message.wasmBinary);
    } else if (message?.type === "noteOn" || message?.type === "noteOff") {
      if (this.noteOn && this.noteOff) this.applyNote(message);
      else this.pendingNotes.push(message);
    }
  }

  applyNote(message) {
    if (message.type === "noteOn") this.noteOn(message.note, message.velocity);
    else this.noteOff(message.note);
  }

  applyParameter(id, value) {
    const param = byId.get(id);
    if (param && this.setParameter) {
      this.setParameter(param.param_id, param.type === "bool" ? Number(Boolean(value)) : Number(value));
    }
  }

  ensureOutput(frames, channels) {
    const samples = frames * channels;
    if (samples <= this.outputCapacity) return;
    if (this.outputPointer) this.module._free(this.outputPointer);
    this.outputPointer = this.module._malloc(samples * Float32Array.BYTES_PER_ELEMENT);
    this.outputCapacity = samples;
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!this.module || !this.processBlock || !output?.length) return true;
    const frames = output[0].length;
    this.ensureOutput(frames, output.length);
    this.processBlock(this.outputPointer, frames, output.length);
    const start = this.outputPointer >> 2;
    for (let channel = 0; channel < output.length; channel += 1) {
      for (let frame = 0; frame < frames; frame += 1) {
        output[channel][frame] =
          this.module.HEAPF32[start + frame * output.length + channel];
      }
    }
    return true;
  }
}

registerProcessor("jackle-processor", JackleProcessor);
