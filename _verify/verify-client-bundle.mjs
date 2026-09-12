/**
 * Headless behavioural verification of the dsh-ppt-maker client bundle.
 *
 * Runs the real `lib/client.js` exactly the way the browser module loader does
 * (capture the lazy-CJS row, materialize the factory), then drives the registered
 * menu entry through both choices and both delivery paths.
 *
 * Usage: node verify-client-bundle.mjs <path-to-lib/client.js>
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLE = process.argv[2];
if (BUNDLE === undefined) throw new Error("usage: node verify-client-bundle.mjs <lib/client.js>");
const source = readFileSync(BUNDLE, "utf8");

const PLUGIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGED_DOC = join(PLUGIN_DIR, "prompts", "PPT全流程_一键编排提示词.md");

let passed = 0;
const check = (label, fn) => {
	fn();
	passed += 1;
	console.log(`  ok  ${label}`);
};

//#region 1. loader contract + source hygiene
let row = null;
new Function("window", source)({ __ModuleLoader__: { load: (r) => { row = r; } } });

check("bundle calls window.__ModuleLoader__.load", () => assert.ok(row !== null));
check("bundle id equals package name", () => assert.equal(row.id, "dsh-ppt-maker"));
check("factory is a function", () => assert.equal(typeof row.factory, "function"));

const requested = [];
const mod = row.factory((spec) => {
	requested.push(spec);
	throw new Error(`unexpected require(${spec}) — this bundle must request no modules`);
});
check("bundle requests zero external modules", () => assert.deepEqual(requested, []));
check("exports apply + inject", () => {
	assert.equal(typeof mod.apply, "function");
	assert.deepEqual(mod.inject, ["commandUi", "sessions"]);
});

/* 回归护栏：早先版本把 C:\Users\<名字>\... 三个绝对路径写死在 bundle 里，插件一搬走就失效。 */
check("paths stay portable (no machine-specific absolute path)", () => {
	assert.equal(source.indexOf("ASUS"), -1, "bundle names a specific user");
	assert.equal(source.indexOf("C:\\\\Users"), -1, "bundle contains a C:\\Users\\ absolute path");
	assert.ok(source.indexOf("%USERPROFILE%") >= 0, "candidate paths should be user-relative");
});
/* 回归护栏：客户端半边只做「加菜单 + 发消息」。
   注意区分"调用"与"告知"：kickoff 里**必须**出现要用户自己发的 /permission 命令，
   但插件**绝不能**自己去调权限通道。 */
check("never changes session permissions itself (it only tells the user)", () => {
	assert.equal(source.indexOf("remote.commands"), -1, "不应通过 remote.commands 调用宿主命令");
	assert.equal(source.indexOf("commands.execute"), -1, "不应执行任何宿主命令");
	assert.equal(source.indexOf('get("remote")'), -1, "不应从上下文取 remote 服务");
	assert.ok(
		source.includes("/permission danger-full-access"),
		"kickoff 应明确写出要用户发送的那一条命令 —— 这是把确认次数从几十次压到一次的关键"
	);
});
check("registers no host route and fetches nothing", () => {
	assert.equal(source.indexOf("/ppt-maker/"), -1);
	assert.equal(source.indexOf("fetch("), -1);
});
/* 回归护栏：dsh.client.inject 是客户端 entry 的先行依赖，动它等于改客户端装载顺序
   （v2 加过 @deepseek-ai/dsh-api-remotes，随后出现"客户端左侧 bug"）。 */
check("client manifest keeps the minimal inject list (no bundle-order churn)", () => {
	const pkg = JSON.parse(readFileSync(join(PLUGIN_DIR, "package.json"), "utf8"));
	assert.deepEqual(pkg.dsh.client.inject, [
		"@deepseek-ai/dsh-client-ui-commands",
		"@deepseek-ai/dsh-client-ui-conversation"
	]);
	assert.equal(pkg.dsh.client.platform, "web");
	assert.equal(pkg.main, "lib/index.js");
});
/* 自带提示词是这个插件的全部载荷：它必须真的在，而且看起来是那份文档。 */
check("packaged prompt exists and looks like the orchestration document", () => {
	const packaged = readFileSync(PACKAGED_DOC, "utf8");
	assert.ok(packaged.length > 20000, `packaged prompt looks too small: ${packaged.length} chars`);
	for (const marker of ["PPT 全流程", "§0.5", "检查点 0", "§四"]) {
		assert.ok(packaged.includes(marker), `packaged prompt is missing "${marker}"`);
	}
});
check("node half stays surface-free (no webserver, no routes)", () => {
	const nodeHalf = readFileSync(join(PLUGIN_DIR, "lib", "index.js"), "utf8");
	assert.equal(nodeHalf.indexOf("webServer"), -1);
	assert.equal(nodeHalf.indexOf("register"), -1);
	assert.ok(nodeHalf.indexOf("statSync") >= 0, "node half should still check its own prompt payload");
});
//#endregion

//#region 2. harness
function harness(opts = {}) {
	const calls = { sink: [], setDraft: [], submit: 0, registered: null };
	const conversation = {
		input: {
			for: () => ({ actions: { setDraft: (t) => calls.setDraft.push(t), submit: () => { calls.submit += 1; } } })
		}
	};
	if (opts.withSink !== false) {
		conversation.input.sink = function sink(_session, text, ids, mode, signal) {
			calls.sink.push({ text, ids, mode, hasSignal: signal instanceof AbortSignal });
			const outcome = typeof opts.sinkOutcomeFn === "function" ? opts.sinkOutcomeFn(calls.sink.length) : (opts.sinkOutcome ?? { kind: "success" });
			return Promise.resolve(outcome);
		};
	}
	const actx = { get: (n) => (n === "conversation" ? conversation : undefined) };
	const sessions = { scope: () => actx, binding: () => ({ session: { id: "host" } }) };
	const scope = {
		commandUi: { register: (spec) => { calls.registered = spec; return () => {}; } },
		get: (n) => (n === "sessions" ? sessions : undefined),
		effect: (fn) => fn()
	};
	mod.apply({ inject: (_deps, cb) => cb(scope) });
	return calls;
}
//#endregion

//#region 3. registration + second step
const base = harness();
check("registers the +menu entry named PPT制作", () => {
	assert.ok(base.registered !== null, "no commandUi.register() call");
	assert.equal(base.registered.name, "PPT制作");
});
check("entry is available in every session", () => assert.equal(base.registered.available({ sessionId: "s1" }), true));
check("entry description is a non-empty string", () => {
	const d = base.registered.description();
	assert.equal(typeof d, "string");
	assert.ok(d.length > 0);
});
check("ui is popupSelect", () => assert.equal(base.registered.ui.kind, "popupSelect"));

const options = await base.registered.ui.options();
check("second step offers exactly the two AI-image choices", () => {
	assert.deepEqual(options.map((o) => o.id), ["ai", "noai"]);
	for (const o of options) {
		assert.equal(typeof o.label, "string");
		assert.equal(typeof o.detail, "string");
	}
});
//#endregion

//#region 4. choice B -> one short message through the sink
const calls = harness();
await calls.registered.ui.onSelect({ id: "noai" }, { sessionId: "s1" });

check("delivers one message through the editor-free sink", () => {
	assert.equal(calls.sink.length, 1);
	assert.equal(calls.sink[0].mode, "queue");
	assert.deepEqual(calls.sink[0].ids, []);
	assert.equal(calls.sink[0].hasSignal, true);
	assert.equal(calls.setDraft.length, 0, "sink path must not touch the Lexical draft");
	assert.equal(calls.submit, 0);
});
const text = calls.sink[0].text;
check("message is short (kickoff only, not the whole document)", () => {
	assert.ok(text.length < 3000, `kickoff should stay short, got ${text.length} chars`);
});
check("choice B pre-answers checkpoint 0 and forbids arkcli", () => {
	assert.match(text, /B\. 不使用 AI 生图/);
	assert.match(text, /不要再问我检查点 0/);
	assert.match(text, /不许碰 arkcli/);
	assert.doesNotMatch(text, /A\. 使用 AI 生图/);
});
check("points at the document by portable candidates", () => {
	assert.match(text, /PPT全流程_一键编排提示词\.md/);
	assert.ok(text.includes("%USERPROFILE%\\.dsh\\local-plugins\\dsh-ppt-maker\\prompts\\"), "packaged candidate missing");
	assert.match(text, /当前工作目录下的同名文件/);
	assert.match(text, /立刻停下告诉我/);
});
check("carries the deliverable + anti-stall rules from the document", () => {
	assert.match(text, /§0\.5/);
	assert.match(text, /present/);
	assert.match(text, /绝对路径/);
	assert.match(text, /不要原样重试/);
	assert.match(text, /检查点 ①/);
});
//#endregion

//#region 5. choice A
const callsA = harness();
await callsA.registered.ui.onSelect({ id: "ai" }, { sessionId: "s1" });
check("choice A pre-answers checkpoint 0 with A", () => {
	assert.match(callsA.sink[0].text, /A\. 使用 AI 生图/);
	assert.doesNotMatch(callsA.sink[0].text, /B\. 不使用 AI 生图/);
});
//#endregion

//#region 6. fallback + failure surfacing
const callsF = harness({ withSink: false });
await callsF.registered.ui.onSelect({ id: "noai" }, { sessionId: "s1" });
check("falls back to setDraft + submit when the sink is unavailable", () => {
	assert.equal(callsF.setDraft.length, 1);
	assert.equal(callsF.submit, 1);
	assert.match(callsF.setDraft[0], /PPT全流程_一键编排提示词\.md/);
});

const callsE = harness({ sinkOutcome: { kind: "error", text: "admission refused" } });
await assert.rejects(() => callsE.registered.ui.onSelect({ id: "noai" }, { sessionId: "s1" }), /admission refused/);
check("surfaces an admission failure as a rejection", () => assert.equal(callsE.setDraft.length, 0));

const callsN = harness();
await assert.rejects(() => callsN.registered.ui.onSelect({ id: "noai" }, undefined), /找不到当前会话/);
check("rejects when no session is addressed", () => {});

/* 连点防护：双击/连按回车不应排两条一样的 kickoff。 */
const callsDbl = harness();
const first = callsDbl.registered.ui.onSelect({ id: "noai" }, { sessionId: "s1" });
const second = callsDbl.registered.ui.onSelect({ id: "noai" }, { sessionId: "s1" });
await Promise.all([first, second]);
check("a double pick sends only one kickoff", () => assert.equal(callsDbl.sink.length, 1));

/* 但失败必须解除防护，否则用户再也发不出去。 */
const callsRetry = harness({ sinkOutcomeFn: (n) => (n === 1 ? { kind: "error", text: "transient" } : { kind: "success" }) });
await assert.rejects(() => callsRetry.registered.ui.onSelect({ id: "noai" }, { sessionId: "s1" }), /transient/);
await callsRetry.registered.ui.onSelect({ id: "noai" }, { sessionId: "s1" });
check("a failed send clears the guard so the user can retry", () => assert.equal(callsRetry.sink.length, 2));
//#endregion

console.log(`\nALL ${passed} CHECKS PASSED`);
