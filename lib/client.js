/**
 * dsh-ppt-maker — client half (web).
 *
 * Adds one entry to the composer “+” menu. That menu is the `/`-trigger candidate
 * list (`ui-conversation` opens it via `inputTriggers.toggleSource("command", …)`,
 * `ui-commands` fills it from its contribution registry), so this bundle needs
 * exactly one extension point:
 *
 *   ctx.commandUi.register({ name, available, description, ui })
 *
 * with `ui.kind === "popupSelect"`, whose native overlay shell (`PopupSelectView`)
 * renders the second step: “use AI images?” / “do not”.
 *
 * Picking either option sends ONE short user message into the current session: it
 * points the agent at the orchestration prompt document and pre-answers
 * 检查点 0, so the document’s own 检查点 ①/②/③ still interrupt the user as designed.
 *
 * Nothing else: no permission switching, no host routes, no notices. The only
 * non-obvious detail is that the referenced paths are **portable** — earlier
 * versions hardcoded `C:\Users\<name>\…`, which broke as soon as the plugin moved.
 *
 * No React and no other module requests: every service used here is reached
 * through the cordis context.
 */
window.__ModuleLoader__.load({
	id: "dsh-ppt-maker",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		//#region prompt wiring
		/** Reported in the kickoff footer so one paste can be traced back to a build. */
		const PLUGIN_VERSION = "1.4.2";
		/** The orchestration document this plugin drives. */
		const PROMPT_FILE = "PPT全流程_一键编排提示词.md";
		/**
		 * Where to find the document, in the order the agent should try. All of them
		 * are user-relative (`%USERPROFILE%`), so the plugin keeps working after being
		 * moved or installed on another machine.
		 */
		const PROMPT_CANDIDATES = [
			"%USERPROFILE%\\.dsh\\local-plugins\\dsh-ppt-maker\\prompts\\" + PROMPT_FILE,
			"%USERPROFILE%\\.dsh\\profiles\\web\\node_modules\\dsh-ppt-maker\\prompts\\" + PROMPT_FILE
		];

		/**
		 * Compose the kickoff message for one AI-image choice.
		 * @param useAi - true for “A. 使用 AI 生图”, false for “B. 不使用”.
		 * @returns the user message to deliver.
		 */
		function kickoff(useAi) {
			const choice = useAi
				? "**A. 使用 AI 生图** —— 按 §二 阶段 B 执行，配图走【七】AI 生图（火山方舟 Seedream）。"
				: "**B. 不使用 AI 生图** —— 整段跳过阶段 B，配图走【七B】程序化图形/SVG；不许碰 arkcli、不许注册火山方舟。";
			/**
			 * The environment self-check, injected as a hard, numbered step of the
			 * kickoff itself — not merely implied by the document — so the run never
			 * needs the user to ask for it. Only for the AI-image branch: what it
			 * installs/launches (arkcli, the automation browser) is exactly what the
			 * no-AI branch is forbidden from touching.
			 */
			const envCheck = useAi
				? [
					"2. **开工第二件事：自己跑一次环境自检，全程不要让我做任何事。**",
					"   先定位插件目录，**按顺序取第一份存在的**（两种安装方式各一条，不要问我、也不要让我去找）：",
					"   ① `%USERPROFILE%\\.dsh\\local-plugins\\dsh-ppt-maker\\` —— `link:` 安装",
					"   ② `%USERPROFILE%\\.dsh\\profiles\\web\\node_modules\\dsh-ppt-maker\\` —— `dsh plugin add` / pnpm 安装",
					"   然后执行：`powershell -NoProfile -ExecutionPolicy Bypass -File \"<插件目录>\\scripts\\check-env.ps1\"`（把 `<插件目录>` 换成上面①或②里存在的那一个）。",
					"   两份都不存在 → 安装不完整：**停下告诉我**，不要自己随便下载脚本凑。",
					"   它会逐项检查 Node / arkcli / dsh-chrome-cdp / 专属自动化浏览器 / 火山登录态，**缺什么自己装**（全局装 arkcli、`dsh plugin add`、按需拉起浏览器、跑 0 手动登录），并把结论打进就绪报告。",
					"   **只有它明确标 `[HUMAN]`（专属浏览器从未登录过火山）时才来找我**；其余一律不要问我，也不要让我手动敲任何命令。"
				]
				: [];
			// The self-check shifts every later number in the AI-image branch.
			const nDoc = useAi ? 3 : 2;
			const nCheck0 = useAi ? 4 : 3;
			const nChecks = useAi ? 5 : 4;
			const nDeliver = useAi ? 6 : 5;
			const nRules = useAi ? 7 : 6;
			return [
				"帮我完成该文件的任务：《PPT 全流程 · 一键自包含编排提示词》。",
				"",
				"1. **开工第一件事：让我把本次会话切到「完全访问」。** 全程只做这一次，之后不再逐条确认 —— 请我发这一句：",
				"   `/permission danger-full-access`",
				"   我**不发** → 直接改走【七B】（程序化图形/SVG，零工作区外写入）；**不要**为了权限反复申请，也**不要**原样重试被拒的命令。",
				...envCheck,
				nDoc + ". 完整指令在 `" + PROMPT_FILE + "`（自包含，不要去找别的文件）。按顺序取**第一份能读到的**：",
				"   ① 当前工作目录下的同名文件",
				"   ② 本插件自带副本：`" + PROMPT_CANDIDATES[0] + "`",
				"   ③ profile 里的同一份：`" + PROMPT_CANDIDATES[1] + "`",
				"   读完严格按它执行。三份都读不到 → 立刻停下告诉我，不要凭记忆自己编流程。",
				nCheck0 + ". **检查点 0（要不要 AI 生图）我已经替你选好了：**" + choice,
				"   **不要再问我检查点 0**，直接按这个选择往下走。",
				nChecks + ". 其余检查点照常停下等我选：检查点 ①（要需求）/ 检查点 ②（选风格）/ 检查点 ③（转不转 PPTX）。",
				nDeliver + ". **每个产出都按文档 §0.5 交给我：打印绝对路径 + 调 `present` 登记成能直接点开的卡片** —— 上一轮我只拿到文件名，找不到文件。",
				nRules + ". 全程守 §四 硬规则；每个阶段做完停下等我确认；同一条命令被拒**不要原样重试**，连续 2 次被拒就停下来告诉我。",
				"",
				"（本条由 DSH 插件 `PPT制作` v" + PLUGIN_VERSION + " 生成）"
			].join("\n");
		}
		//#endregion

		//#region second-step options (rendered by the native popupSelect shell)
		/** The AI-image decision, phrased for 检查点 0 of the orchestration document. */
		const OPTIONS = [
			{
				id: "ai",
				label: "A. 使用 AI 生图",
				detail: "走【七】Seedream · 需火山方舟账号/授权 · 约 0.3 元/张"
			},
			{
				id: "noai",
				label: "B. 不使用 AI 生图",
				detail: "走【七B】程序化图形/SVG · 零成本、断网可用"
			}
		];
		//#endregion

		//#region delivery
		/**
		 * Deliver one user message into the addressed session.
		 *
		 * Preferred route is the input hub's editor-free sink: the kickoff must not
		 * travel through the Lexical draft, where the `/` and `@` detectors would scan
		 * it. Falls back to the documented per-session facade when the sink is absent.
		 * @param scope - the injected scope (exposes commandUi + sessions).
		 * @param session - the pick-session handed to `onSelect`.
		 * @param text - the message body.
		 */
		async function deliver(scope, session, text) {
			const sessions = scope.get("sessions");
			const id = session?.sessionId;
			if (sessions === undefined || id === undefined) throw new Error("找不到当前会话，请先打开一个会话再试。");
			const actx = sessions.scope(id);
			const conversation = (actx !== undefined && actx.get("conversation")) || scope.get("conversation");
			if (conversation === undefined) throw new Error("conversation 服务不可用，PPT 制作无法启动。");

			const binding = sessions.binding(id);
			const rawSink = conversation.input?.sink;
			if (typeof rawSink === "function" && binding !== undefined && binding.session !== undefined) {
				const outcome = await rawSink.call(conversation.input, binding.session, text, [], "queue", new AbortController().signal);
				if (outcome?.kind === "success") return;
				if (outcome?.kind === "error" && outcome.text !== undefined) throw new Error(outcome.text);
			}

			if (actx === undefined) throw new Error("会话作用域尚未就绪，请稍后重试。");
			const shell = conversation.input.for(actx);
			shell.actions.setDraft(text);
			shell.actions.submit();
		}
		//#endregion

		//#region plugin body
		/** Required client services: the contribution registry and session scopes. */
		const inject = [
			"commandUi",
			"sessions"
		];

		/**
		 * Guards against a double pick (double-click, or Enter pressed twice quickly)
		 * queuing the same kickoff twice. Cleared on both settle paths, so a failed
		 * send stays retryable.
		 */
		let inFlight = false;

		/**
		 * Client plugin body.
		 * @param ctx - the client root context.
		 */
		function apply(ctx) {
			ctx.inject(["commandUi", "sessions"], (scope) => {
				scope.effect(() => scope.commandUi.register({
					name: "PPT制作",
					available: () => true,
					description: () => "PPT 制作 · 一键跑全流程（先选要不要 AI 生图）",
					ui: {
						kind: "popupSelect",
						options: () => Promise.resolve(OPTIONS),
						onSelect: (option, session) => {
							if (inFlight) return Promise.resolve();
							inFlight = true;
							return deliver(scope, session, kickoff(option.id === "ai")).then(
								(value) => { inFlight = false; return value; },
								(error) => { inFlight = false; throw error; }
							);
						}
					}
				}), "ppt-maker: PPT制作 menu entry");
			});
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
