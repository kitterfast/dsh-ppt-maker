/**
 * dsh-ppt-maker — node half.
 *
 * The plugin is a client-only feature: the “PPT 制作” entry lives in the
 * composer “+” menu (a `commandUi` contribution) and the kickoff message is
 * composed in the browser. The node half therefore owns no feature behaviour; it
 * exists so the loader has a mountable row whose `dsh.client` declaration
 * composes the browser bundle (that declaration lives in package.json).
 *
 * What it does do is one line of **diagnostics for its own payload**: at boot it
 * checks that the packaged copy of the orchestration prompt is really there and
 * logs the resolved path with its size. Without that, a missing/renamed prompt
 * only shows up much later as "the agent says it cannot find the document".
 *
 * Deliberately surface-free: no host routes, no file writes, no outbound calls,
 * no imports outside Node builtins.
 */
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Loader entry name; must equal the package name. */
export const name = "dsh-ppt-maker";

/** Required node services: none. */
export const inject = [];

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = join(HERE, "..");
/** Must match `PROMPT_FILE` in lib/client.js. */
const PROMPT_FILE = "PPT全流程_一键编排提示词.md";
const PROMPT_PATH = join(PACKAGE_DIR, "prompts", PROMPT_FILE);

let version = "0.0.0";
try {
	version = JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8")).version ?? version;
} catch {
	/* version is cosmetic; never fail the plugin over it */
}

/**
 * Client-plugin body (node side).
 * @param ctx - the node plugin context.
 */
export function apply(ctx) {
	try {
		const bytes = statSync(PROMPT_PATH).size;
		ctx.logger?.info?.(`ppt-maker v${version}: packaged prompt OK — ${PROMPT_PATH} (${bytes} bytes)`);
	} catch (error) {
		ctx.logger?.warn?.(
			`ppt-maker v${version}: packaged prompt MISSING at ${PROMPT_PATH} — the kickoff will fall back to the in-workspace copy. (${String(error)})`
		);
	}
}
