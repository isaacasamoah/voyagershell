#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const NOTICE = [
  "codex-voice-live-check: UNRUN. It talks to OpenAI's servers under a ChatGPT subscription login.",
  "Run it only with a live Codex subscription and the admiral's explicit go, passed as --admiral-go.",
  "It refuses to start when any API key is set, when the login is not the ChatGPT subscription,",
  "or when a required environment variable is missing. It uses synthetic speech only.",
];

const FORBIDDEN_ENV = /(^|_)API_KEY$|^OPENAI_|^CODEX_API|^CODEX_ACCESS|^CHATGPT_/i;
const REQUIRED_ENV = ["CODEX_VOICE_LIVE_CHECK_WORK", "CODEX_VOICE_LIVE_CHECK_SINK", "CODEX_VOICE_LIVE_CHECK_MIC"];
const SPEECH_PEAK = 400;
const POLL_MS = 50;

const RELAY_INSTRUCTIONS =
  "You are a relay. You have exactly one tool, ask_voyager. For every request, call ask_voyager once with the user's own words and nothing else. Never answer, explain, run commands or use any other tool. After the tool returns, say nothing.";
const SESSION_PROMPT =
  "You only transcribe and speak. Do not answer the user yourself. For every user request, call the delegation once with the user's own words. When you are given text to speak, read it aloud word for word and add nothing.";

const UTTERANCES = [
  { id: "u1", text: "Please tell me the status of the build for the voyager shell project." },
  { id: "u2", text: "Open a new terminal next to the current one." },
];
const SPOKEN_REPLY = "The build passed. Three checks ran, and none failed.";

const now = () => performance.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const words = (text) => text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);

function refuse(reason) {
  console.error(`REFUSED: ${reason}`);
  process.exit(2);
}

function preflight() {
  for (const line of NOTICE) console.error(line);
  if (!process.argv.includes("--admiral-go")) refuse("missing --admiral-go");
  const keys = Object.keys(process.env).filter((name) => FORBIDDEN_ENV.test(name));
  if (keys.length) refuse(`these variables must be unset: ${keys.join(", ")}`);
  for (const name of REQUIRED_ENV) if (!process.env[name]) refuse(`${name} is required`);
  const work = process.env.CODEX_VOICE_LIVE_CHECK_WORK;
  mkdirSync(work, { recursive: true });
  for (const tool of ["espeak-ng", "paplay", "codex"]) {
    try {
      execFileSync("which", [tool], { stdio: "ignore" });
    } catch {
      refuse(`${tool} is not on PATH`);
    }
  }
  return work;
}

function findHelper() {
  const executable = realpathSync(execFileSync("which", ["codex"], { encoding: "utf8" }).trim());
  const root = dirname(dirname(executable));
  const manifestPath = join(root, "codex-resources/voice/manifest.json");
  if (!existsSync(manifestPath)) refuse("this Codex installation has no native voice package");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return { root, helper: join(root, "codex-resources/voice/bin/codex-voice-host"), build: manifest.buildCommit };
}

class AppServer {
  constructor() {
    this.child = spawn("codex", ["app-server"], { stdio: ["pipe", "pipe", "inherit"] });
    this.next = 1;
    this.pending = new Map();
    this.events = [];
    this.waiters = [];
    this.buffer = "";
    this.child.stdout.on("data", (chunk) => this.read(chunk));
  }

  read(chunk) {
    this.buffer += chunk.toString("utf8");
    let at;
    while ((at = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, at);
      this.buffer = this.buffer.slice(at + 1);
      if (line.trim()) this.dispatch(JSON.parse(line));
    }
  }

  dispatch(message) {
    if (message.id !== undefined && !message.method) {
      const waiter = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (waiter) waiter(message);
      return;
    }
    const event = { at: now(), message };
    this.events.push(event);
    if (message.method === "item/tool/call" && message.id !== undefined) this.onToolCall?.(message, event.at);
    this.waiters = this.waiters.filter((waiter) => !waiter(event));
  }

  send(method, params) {
    const id = this.next++;
    this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    return new Promise((resolve) => this.pending.set(id, resolve));
  }

  notify(method, params) {
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  reply(id, result) {
    this.child.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }

  waitFor(test, ms) {
    const seen = this.events.find((event) => test(event.message));
    if (seen) return Promise.resolve(seen);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), ms);
      this.waiters.push((event) => {
        if (!test(event.message)) return false;
        clearTimeout(timer);
        resolve(event);
        return true;
      });
    });
  }

  stop() {
    this.child.kill();
  }
}

function frame(signal) {
  const body = Buffer.from(JSON.stringify(signal));
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  return Buffer.concat([head, body]);
}

class Helper {
  constructor({ root, helper }) {
    this.child = spawn(helper, [], { cwd: root, stdio: ["pipe", "pipe", "ignore"] });
    this.buffer = Buffer.alloc(0);
    this.queue = [];
    this.waiting = [];
    this.child.stdout.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      while (this.buffer.length >= 4 && this.buffer.length >= 4 + this.buffer.readUInt32BE(0)) {
        const length = this.buffer.readUInt32BE(0);
        const signal = JSON.parse(this.buffer.subarray(4, 4 + length).toString("utf8"));
        this.buffer = this.buffer.subarray(4 + length);
        const waiter = this.waiting.shift();
        if (waiter) waiter(signal);
        else this.queue.push(signal);
      }
    });
  }

  exchange(signal, ms = 20000) {
    this.child.stdin.write(frame(signal));
    return new Promise((resolve, reject) => {
      const take = this.queue.shift();
      if (take) return resolve(take);
      const timer = setTimeout(() => reject(new Error(`no reply to ${signal.type}`)), ms);
      this.waiting.push((reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
    });
  }

  stop() {
    this.child.kill();
  }
}

function speakSynthetic(work, utterance) {
  const wav = join(work, `${utterance.id}.wav`);
  execFileSync("espeak-ng", ["-w", wav, utterance.text]);
  const started = now();
  const player = spawn("paplay", [`--device=${process.env.CODEX_VOICE_LIVE_CHECK_SINK}`, wav], { stdio: "ignore" });
  const finished = new Promise((resolve) => player.on("exit", () => resolve(now())));
  return { started, finished };
}

async function watchSpeaker(helper, state) {
  while (!state.stop) {
    const reply = await helper.exchange({ type: "inspectAudio" }, 3000).catch(() => null);
    if (reply?.type === "audioState") {
      const peak = reply.state.speakerPeak;
      state.samples.push({ at: now(), peak });
      if (peak >= SPEECH_PEAK) state.sound.push(now());
    }
    await sleep(POLL_MS);
  }
}

const first = (list, after) => list.find((at) => at >= after) ?? null;
const ms = (value) => (value === null ? null : Math.round(value));

async function main() {
  const work = preflight();
  const result = { questions: {}, raw: {} };
  const server = new AppServer();
  const helperInfo = findHelper();
  const helper = new Helper(helperInfo);
  try {
    const init = await server.send("initialize", {
      clientInfo: { name: "codex_voice_live_check", version: "0.0.0" },
      capabilities: { experimentalApi: true },
    });
    server.notify("initialized", {});
    result.raw.initialize = init.result?.userAgent ?? init.error;

    const account = await server.send("account/read", { refreshToken: false });
    if (account.result?.account?.type !== "chatgpt") refuse("the Codex login is not the ChatGPT subscription");
    result.raw.limitsBefore = (await server.send("account/rateLimits/read", {})).result ?? null;

    const thread = await server.send("thread/start", {
      ephemeral: true,
      cwd: work,
      approvalPolicy: "never",
      sandbox: "read-only",
      dynamicTools: [
        {
          type: "function",
          name: "ask_voyager",
          description: "Send the user's own words to Voyager.",
          inputSchema: {
            type: "object",
            properties: { words: { type: "string" } },
            required: ["words"],
            additionalProperties: false,
          },
        },
      ],
      baseInstructions: RELAY_INSTRUCTIONS,
    });
    const threadId = thread.result?.thread?.id;
    if (!threadId) refuse(`thread/start failed: ${JSON.stringify(thread.error)}`);

    const websocket = await server.send("thread/realtime/start", {
      threadId,
      outputModality: "audio",
      version: "v2",
      transport: { type: "websocket" },
      prompt: SESSION_PROMPT,
    });
    result.questions.q1_websocket_without_key = websocket.error
      ? { ok: false, error: websocket.error.message }
      : { ok: true, note: "the websocket route started without an API key" };

    const calls = [];
    server.onToolCall = (message, at) => {
      calls.push({ at, tool: message.params.tool, words: message.params.arguments?.words ?? null });
      server.reply(message.id, {
        success: true,
        contentItems: [{ type: "inputText", text: "Voyager received the request." }],
      });
    };

    await helper.exchange({ type: "hello", protocol: 1, buildCommit: helperInfo.build });
    await helper.exchange({ type: "initializeRuntime" });
    const offer = await helper.exchange({ type: "startTransport" });
    const started = await server.send("thread/realtime/start", {
      threadId,
      outputModality: "audio",
      version: "v3",
      voice: "sol",
      transport: { type: "webrtc", sdp: offer.sdp },
      clientManagedHandoffs: true,
      delegationAckFiller: false,
      prompt: SESSION_PROMPT,
    });
    if (started.error) {
      result.questions.q1_webrtc_subscription = { ok: false, error: started.error.message };
      return finish(result, server, helper, threadId, work);
    }
    const answer = await server.waitFor((m) => m.method === "thread/realtime/sdp", 30000);
    result.questions.q1_webrtc_subscription = answer ? { ok: true } : { ok: false, error: "no answer description" };
    if (!answer) return finish(result, server, helper, threadId, work);
    await helper.exchange({ type: "applyAnswer", sdp: answer.message.params.sdp }, 25000);
    await helper.exchange({ type: "openDevices", selection: { microphone: process.env.CODEX_VOICE_LIVE_CHECK_MIC } });
    await helper.exchange({ type: "setAudioControls", controls: { microphoneMuted: false, speakerSuppressed: false } });

    const watch = { stop: false, samples: [], sound: [] };
    const watcher = watchSpeaker(helper, watch);
    const turns = [];
    for (const utterance of UTTERANCES) {
      const mark = server.events.length;
      const spoken = speakSynthetic(work, utterance);
      const endedAt = await spoken.finished;
      const userDone = await server.waitFor(
        (m) =>
          m.method === "thread/realtime/item/completed" &&
          m.params.item.type === "transcriptSegment" &&
          m.params.item.role === "user",
        20000,
      );
      const call = await waitForCall(calls, endedAt, 20000);
      await sleep(4000);
      const slice = server.events.slice(mark).map((event) => event.message);
      const selfAnswers = slice.filter(
        (m) =>
          m.method === "thread/realtime/item/completed" &&
          m.params.item.type === "transcriptSegment" &&
          m.params.item.role === "assistant",
      );
      const codexActed = slice.filter(
        (m) => m.method === "item/started" && !["userMessage", "dynamicToolCall"].includes(m.params.item?.type),
      );
      turns.push({
        id: utterance.id,
        spoken: utterance.text,
        transcript: userDone?.message.params.item.text ?? null,
        transcriptWordMatch: userDone
          ? words(utterance.text).filter((w) => words(userDone.message.params.item.text).includes(w)).length /
            words(utterance.text).length
          : null,
        transcriptMs: userDone ? ms(userDone.at - endedAt) : null,
        delegationMs: call ? ms(call.at - endedAt) : null,
        delegated: call ? { tool: call.tool, words: call.words } : null,
        firstSoundMs: ms((first(watch.sound, endedAt) ?? NaN) - endedAt) || null,
        selfAnswers: selfAnswers.map((m) => m.params.item.text),
        otherItems: codexActed.map((m) => m.params.item?.type),
      });
    }

    const speakMark = server.events.length;
    const speakAt = now();
    const speak = await server.send("thread/realtime/appendSpeech", { threadId, text: SPOKEN_REPLY });
    await sleep(8000);
    const spokenItems = server.events
      .slice(speakMark)
      .map((event) => event.message)
      .filter(
        (m) =>
          m.method === "thread/realtime/item/completed" &&
          m.params.item.type === "transcriptSegment" &&
          m.params.item.role === "assistant",
      )
      .map((m) => m.params.item.text);
    const heard = words(spokenItems.join(" "));
    const given = words(SPOKEN_REPLY);
    watch.stop = true;
    await watcher;
    result.questions.q3_verbatim = {
      accepted: !speak.error,
      given: SPOKEN_REPLY,
      spokenTranscript: spokenItems,
      missingWords: given.filter((w) => !heard.includes(w)),
      extraWords: heard.filter((w) => !given.includes(w)),
      firstSoundMs: ms((first(watch.sound, speakAt) ?? NaN) - speakAt) || null,
    };
    result.questions.q2_transcribe_only = turns.map((t) => ({
      id: t.id,
      transcript: t.transcript,
      wordMatch: t.transcriptWordMatch,
      answeredItself: t.selfAnswers.length > 0,
    }));
    result.questions.q4_roles = turns.map((t) => ({
      id: t.id,
      delegated: t.delegated,
      selfAnswers: t.selfAnswers,
      otherCodexItems: t.otherItems,
      held:
        t.delegated?.tool === "ask_voyager" && t.selfAnswers.length === 0 && t.otherItems.length === 0,
    }));
    result.questions.q5_timing = turns.map((t) => ({
      id: t.id,
      transcriptMs: t.transcriptMs,
      delegationMs: t.delegationMs,
      firstSoundMs: t.firstSoundMs,
    }));
    result.raw.turnStarts = server.events.filter((e) => e.message.method === "turn/started").length;
    return finish(result, server, helper, threadId, work);
  } finally {
    helper.stop();
    server.stop();
  }
}

async function waitForCall(calls, after, limit) {
  const until = now() + limit;
  while (now() < until) {
    const call = calls.find((c) => c.at >= after - 5000);
    if (call) return call;
    await sleep(50);
  }
  return null;
}

async function finish(result, server, helper, threadId, work) {
  await server.send("thread/realtime/stop", { threadId }).catch(() => null);
  await helper.exchange({ type: "close" }, 5000).catch(() => null);
  result.raw.limitsAfter = (await server.send("account/rateLimits/read", {})).result ?? null;
  writeFileSync(join(work, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.questions, null, 2));
  console.log("limits before:", JSON.stringify(result.raw.limitsBefore));
  console.log("limits after: ", JSON.stringify(result.raw.limitsAfter));
  console.log("A change in the plan usage figures with no API key set is the evidence that voice is billed to the subscription.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
