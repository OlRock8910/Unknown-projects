// Spark's free brain: a small open AI model that runs on the phone itself,
// in this background worker so the app stays smooth while it thinks.
//
// The first time, the model downloads from Hugging Face and is cached on the
// device; after that it loads from the cache and works offline. It runs on
// the phone's graphics chip when the browser allows it (WebGPU), otherwise
// on the processor (WebAssembly), which is slower.
//
// Messages in:  { type: 'load' }
//               { type: 'generate', id, messages }  (chat-format messages)
//               { type: 'stop' }
// Messages out: { type: 'progress', loaded, total, file }
//               { type: 'ready', model, device }
//               { type: 'token', id, text }
//               { type: 'done', id }
//               { type: 'error', id?, message }
import { AutoTokenizer, AutoModelForCausalLM, TextStreamer, InterruptableStoppingCriteria } from './vendor/transformers.js';

// Tried in order until one loads. Both are small enough for a phone.
const MODELS = [
  { id: 'onnx-community/Qwen3-0.6B-ONNX', name: 'Qwen3 0.6B', thinking: true },
  { id: 'onnx-community/Qwen2.5-0.5B-Instruct', name: 'Qwen2.5 0.5B', thinking: false },
];

let brain = null; // { tokenizer, model, info }
let loading = null;
const stopper = new InterruptableStoppingCriteria();

async function pickDevice() {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter) return { device: 'webgpu', dtype: adapter.features.has('shader-f16') ? 'q4f16' : 'q4' };
  } catch {
    // No usable graphics chip: use the processor.
  }
  return { device: 'wasm', dtype: 'q4' };
}

async function load() {
  const files = new Map(); // file → { loaded, total }
  const progress_callback = (p) => {
    if (p.status !== 'progress' && p.status !== 'done') return;
    const f = files.get(p.file) ?? { loaded: 0, total: 0 };
    if (p.total) f.total = p.total;
    f.loaded = p.status === 'done' ? f.total || f.loaded : p.loaded ?? f.loaded;
    files.set(p.file, f);
    let loaded = 0;
    let total = 0;
    for (const v of files.values()) {
      loaded += v.loaded;
      total += v.total;
    }
    postMessage({ type: 'progress', loaded, total, file: p.file });
  };

  const first = await pickDevice();
  const tries = [first, ...(first.device === 'webgpu' ? [{ device: 'wasm', dtype: 'q4' }] : [])];
  let lastError;
  for (const info of MODELS) {
    for (const { device, dtype } of tries) {
      try {
        files.clear();
        const tokenizer = await AutoTokenizer.from_pretrained(info.id, { progress_callback });
        const model = await AutoModelForCausalLM.from_pretrained(info.id, { dtype, device, progress_callback });
        return { tokenizer, model, info: { ...info, device } };
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw lastError;
}

async function generate(id, messages) {
  const { tokenizer, model, info } = brain;
  const inputs = tokenizer.apply_chat_template(messages, {
    add_generation_prompt: true,
    return_dict: true,
    enable_thinking: false, // quick answers; small models ramble when they "think"
  });
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => postMessage({ type: 'token', id, text }),
  });
  stopper.reset();
  await model.generate({
    ...inputs,
    max_new_tokens: 768,
    // The makers' recommended settings for chatting without thinking.
    do_sample: true,
    temperature: 0.7,
    top_p: 0.8,
    top_k: 20,
    repetition_penalty: info.thinking ? 1.05 : 1.1,
    streamer,
    stopping_criteria: stopper,
  });
  postMessage({ type: 'done', id });
}

self.onmessage = async ({ data }) => {
  if (data.type === 'stop') {
    stopper.interrupt();
    return;
  }
  try {
    loading ??= load();
    brain = await loading;
    if (data.type === 'load') postMessage({ type: 'ready', model: brain.info.name, device: brain.info.device });
    if (data.type === 'generate') await generate(data.id, data.messages);
  } catch (err) {
    loading = null;
    postMessage({ type: 'error', id: data.id, message: err?.message || String(err) });
  }
};
