/**
 * Source-tree + packaging check for dsh-ppt-maker.
 *
 * Answers two questions mechanically:
 *   - is every source file of this plugin present, declared, and consistent?
 *   - is the installed copy (if any) exactly the source?
 *
 * Run it after moving files around, before publishing, and before trusting an install.
 * `npm run verify` runs this plus the client-bundle suite.
 *
 * Usage: node _verify/verify-package.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repository root == package root. */
const PLUGIN_DIR = resolve(HERE, "..");
const PROMPT_FILE = "PPT全流程_一键编排提示词.md";
const PROMPT_REL = join("prompts", PROMPT_FILE);
const HOME = process.env.USERPROFILE ?? process.env.HOME ?? "";
const INSTALL_DIR = process.env.DSH_PPT_MAKER_INSTALL ?? join(HOME, ".dsh", "local-plugins", "dsh-ppt-maker");

let passed = 0;
const check = (label, fn) => {
	fn();
	passed += 1;
	console.log(`  ok  ${label}`);
};
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

/** Directories that are never plugin source (VCS metadata, installed deps). */
const SKIP_DIRS = new Set([".git", "node_modules"]);

/** Walk a directory into relative file paths (no symlink following, no VCS/deps). */
function walk(dir, base = dir) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full, base));
		else if (entry.isFile()) out.push(relative(base, full));
	}
	return out;
}

const pkg = JSON.parse(readFileSync(join(PLUGIN_DIR, "package.json"), "utf8"));

//#region 1. required source files
const REQUIRED = [
	"package.json",
	"cordis.patch.yml",
	"README.md",
	"LICENSE",
	"CHANGELOG.md",
	".gitignore",
	join(".github", "workflows", "verify.yml"),
	"lib/index.js",
	"lib/client.js",
	PROMPT_REL,
	join("docs", "已删除的机制说明.md"),
	join("_verify", "verify-client-bundle.mjs"),
	join("_verify", "verify-package.mjs")
];
check(`all ${REQUIRED.length} required source files exist and are non-empty`, () => {
	const missing = REQUIRED.filter((rel) => !existsSync(join(PLUGIN_DIR, rel)));
	assert.deepEqual(missing, [], `缺少源文件: ${missing.join(", ")}`);
	for (const rel of REQUIRED) {
		assert.ok(statSync(join(PLUGIN_DIR, rel)).size > 0, `${rel} 是空文件`);
	}
});
//#endregion

//#region 2. package.json is publishable
const entryPaths = {
	main: pkg.main,
	'exports["./client"]': pkg.exports?.["./client"],
	"dsh.bundle.patch": pkg.dsh?.bundle?.patch
};
check("package.json entry points resolve to real files", () => {
	for (const [label, rel] of Object.entries(entryPaths)) {
		assert.equal(typeof rel, "string", `${label} 未声明`);
		assert.ok(existsSync(join(PLUGIN_DIR, rel)), `${label} -> ${rel} 不存在`);
	}
	assert.equal(pkg.dsh?.client?.platform, "web");
});
check("package.json is publishable (no private flag, has license + keywords)", () => {
	assert.notEqual(pkg.private, true, "private:true 会让 npm publish 直接失败");
	assert.equal(typeof pkg.license, "string");
	assert.ok(Array.isArray(pkg.keywords) && pkg.keywords.length >= 3, "keywords 太少，不利于被发现");
	assert.equal(pkg.type, "module");
	assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
});
check("LICENSE file matches the declared license", () => {
	const license = readFileSync(join(PLUGIN_DIR, "LICENSE"), "utf8");
	assert.ok(license.includes("MIT License"), "LICENSE 不是 MIT 文本");
	assert.equal(pkg.license, "MIT");
});
//#endregion

//#region 3. files[] covers the whole source tree
check("files[] declares every top-level entry of the source tree", () => {
	const listed = new Set(pkg.files ?? []);
	const alwaysIncluded = new Set(["package.json", ".gitignore", ".github"]);
	const roots = new Set(walk(PLUGIN_DIR).map((rel) => rel.split(/[\\/]/)[0]));
	const undeclared = [...roots].filter((name) => !listed.has(name) && !alwaysIncluded.has(name));
	assert.deepEqual(undeclared, [], `源树里有未在 files[] 声明的顶层条目: ${undeclared.join(", ")}`);
});
//#endregion

//#region 4/5. patch row + version consistency
check("cordis.patch.yml mounts this package under the expected row id", () => {
	const patch = readFileSync(join(PLUGIN_DIR, "cordis.patch.yml"), "utf8");
	assert.match(patch, /id:\s*ppt-maker\b/);
	assert.match(patch, /name:\s*'dsh-ppt-maker'/);
	assert.match(patch, /^\s*-\s*insert:/m);
});
check("client PLUGIN_VERSION matches package.json version", () => {
	const client = readFileSync(join(PLUGIN_DIR, "lib", "client.js"), "utf8");
	const m = client.match(/const PLUGIN_VERSION = "([^"]+)"/);
	assert.ok(m !== null, "client.js 里找不到 PLUGIN_VERSION");
	assert.equal(m[1], pkg.version, `客户端版本戳 ${m[1]} 与 package.json ${pkg.version} 不一致`);
});
//#endregion

//#region 6. the prompt payload
check("the prompt payload is present and looks like the orchestration document", () => {
	const prompt = readFileSync(join(PLUGIN_DIR, PROMPT_REL), "utf8");
	assert.ok(prompt.length > 20000, `prompt 过小: ${prompt.length} chars`);
	for (const marker of ["PPT 全流程", "§0.5", "检查点 0", "§四"]) {
		assert.ok(prompt.includes(marker), `prompt 里缺少 "${marker}" —— 可能被截断或换成了占位内容`);
	}
});
check("no second copy of the prompt exists (single source of truth)", () => {
	const copies = walk(PLUGIN_DIR).filter((rel) => rel.endsWith(PROMPT_FILE));
	assert.deepEqual(copies, [PROMPT_REL], `提示词有多份副本，会产生漂移: ${copies.join(", ")}`);
});
//#endregion

//#region 7. install == packaged payload
const sourceFiles = walk(PLUGIN_DIR).sort();
/** The concrete files npm would publish (`files[]` expanded, plus package.json). */
const packagedFiles = sourceFiles.filter((rel) => {
	const top = rel.split(/[\\/]/)[0];
	return rel === "package.json" || (pkg.files ?? []).includes(top);
});
if (!existsSync(INSTALL_DIR)) {
	console.log(`  --  install target not found (${INSTALL_DIR || "n/a"}); sync check skipped`);
} else {
	check("every packaged file is installed and byte-identical", () => {
		const missing = packagedFiles.filter((f) => !existsSync(join(INSTALL_DIR, f)));
		assert.deepEqual(missing, [], `安装目标缺少: ${missing.join(", ")}`);
		const drifted = packagedFiles.filter((f) => !readFileSync(join(PLUGIN_DIR, f)).equals(readFileSync(join(INSTALL_DIR, f))));
		assert.deepEqual(drifted, [], `安装与源不一致: ${drifted.join(", ")}`);
	});
	check("install target carries no file the source does not have", () => {
		const unknown = walk(INSTALL_DIR).filter((f) => !sourceFiles.includes(f));
		assert.deepEqual(unknown, [], `安装目标里有源里没有的文件（旧版本残留？）: ${unknown.join(", ")}`);
	});
}
//#endregion

//#region manifest
console.log("\n  sha256 manifest (source)");
for (const rel of sourceFiles) {
	const buf = readFileSync(join(PLUGIN_DIR, rel));
	console.log(`    ${sha(buf).slice(0, 16)}  ${String(buf.length).padStart(8)} B  ${rel}`);
}
console.log(`\n  package dir: ${PLUGIN_DIR}`);
console.log(`  install dir: ${existsSync(INSTALL_DIR) ? INSTALL_DIR : "(absent — not installed on this machine)"}`);
//#endregion

console.log(`\nALL ${passed} PACKAGE CHECKS PASSED`);
