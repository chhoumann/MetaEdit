(async () => {
	const PLUGIN_ID = "metaedit";
	const SCRATCH_DIR = "MetaEdit Mobile Debug";
	const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
	const ROOT = `${SCRATCH_DIR}/core-smoke-${RUN_ID}`;
	const BOARD_NAME = `Roadmap-${RUN_ID}`;
	const CLEANUP = true;
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const failures = [];
	const createdPaths = [];
	const cleanup = { attempted: false, deleted: [], errors: [] };

	const ensureFolder = async (path) => {
		const parts = path.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!app.vault.getAbstractFileByPath(current)) {
				await app.vault.createFolder(current);
			}
		}
	};
	const deleteIfExists = async (path) => {
		const existing = app.vault.getAbstractFileByPath(path);
		if (existing) await app.vault.delete(existing);
	};
	const deleteEmptyFolder = async (path) => {
		const existing = app.vault.getAbstractFileByPath(path);
		if (!existing) return;
		const listed = await app.vault.adapter.list(path).catch(() => null);
		if (listed && listed.files.length === 0 && listed.folders.length === 0) {
			await app.vault.delete(existing);
			cleanup.deleted.push(path);
		}
	};
	const createFreshFile = async (path, content) => {
		const folder = path.split("/").slice(0, -1).join("/");
		if (folder) await ensureFolder(folder);
		await deleteIfExists(path);
		const file = await app.vault.create(path, content);
		createdPaths.push(path);
		await sleep(500);
		return file;
	};
	const waitFor = async (selectorOrPredicate, label, timeout = 10000) => {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			const value = typeof selectorOrPredicate === "string"
				? document.querySelector(selectorOrPredicate)
				: await selectorOrPredicate();
			if (value) return value;
			await sleep(100);
		}
		throw new Error(`Timed out waiting for ${label}`);
	};
	const closeTransientUi = async () => {
		for (const button of Array.from(document.querySelectorAll(".modal-close-button"))) {
			button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		}
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		for (const element of Array.from(document.querySelectorAll(".suggestion-container, .suggestion-item"))) {
			element.remove();
		}
		await sleep(100);
	};
	const cleanupScratch = async () => {
		if (!CLEANUP) return cleanup;
		cleanup.attempted = true;
		for (const path of [...createdPaths].reverse()) {
			try {
				const existing = app.vault.getAbstractFileByPath(path);
				if (existing) {
					await app.vault.delete(existing);
					cleanup.deleted.push(path);
				}
			} catch (error) {
				cleanup.errors.push(`${path}: ${String(error?.stack || error)}`);
			}
		}
		try {
			await deleteEmptyFolder(ROOT);
			await deleteEmptyFolder(SCRATCH_DIR);
		} catch (error) {
			cleanup.errors.push(`folders: ${String(error?.stack || error)}`);
		}
		return cleanup;
	};
	const textOfSuggestion = (element) => {
		const textEl = element.querySelector(".suggestion-item-text") || element;
		return (textEl.textContent || "").replace(/[\u274c\ud83d\udd03]/g, "").trim();
	};

	const plugin = app.plugins.plugins[PLUGIN_ID];
	if (!plugin?.api) throw new Error("MetaEdit plugin API is not available.");
	const settingsSnapshot = JSON.parse(JSON.stringify(plugin.settings));
	const results = {};
	const resetAutomators = () => {
		plugin.settings.KanbanHelper.enabled = false;
		plugin.settings.ProgressProperties.enabled = false;
		plugin.toggleAutomators();
	};

	try {
		await ensureFolder(ROOT);

		const editFile = await createFreshFile(`${ROOT}/edit-meta-and-inline.md`, [
			"---",
			"status: todo",
			"---",
			"# Edit Meta smoke",
			"inline_status:: draft",
			"",
		].join("\n"));
		await app.workspace.getLeaf(false).openFile(editFile);
		await sleep(300);
		await app.commands.executeCommandById(`${PLUGIN_ID}:metaEditRun`);
		await waitFor(".suggestion-item", "Edit Meta suggestion items");
		await sleep(150);
		const menuKeys = Array.from(document.querySelectorAll(".suggestion-item")).map(textOfSuggestion);
		results.editMetaMenuKeys = menuKeys;
		if (!menuKeys.includes("status")) failures.push("Edit Meta menu did not include YAML status.");
		if (!menuKeys.includes("inline_status")) failures.push("Edit Meta menu did not include inline_status.");
		await closeTransientUi();

		await plugin.api.update("inline_status", "published", editFile);
		await sleep(300);
		const inlineContent = await app.vault.read(editFile);
		results.inlineContent = inlineContent;
		if (!inlineContent.includes("inline_status:: published")) failures.push("Inline key:: field did not update.");

		const autoFile = await createFreshFile(`${ROOT}/auto-property.md`, [
			"---",
			"ap_status: todo",
			"---",
			"# Auto Property smoke",
			"",
		].join("\n"));
		plugin.settings.AutoProperties.enabled = true;
		plugin.settings.AutoProperties.properties = [{
			name: "ap_status",
			choices: ["todo", "done"],
			description: "Mobile smoke choice",
			type: "Single",
		}];
		const autoProps = await plugin.controller.getPropertiesInFile(autoFile);
		const autoProperty = autoProps.find((property) => property.key === "ap_status");
		if (!autoProperty) throw new Error("ap_status property was not parsed.");
		const autoEditPromise = plugin.controller.editMetaElement(autoProperty, autoProps, autoFile);
		const modal = await waitFor(".metaedit-ap-prompt", "Auto Property prompt");
		const doneRow = await waitFor(
			() => Array.from(modal.querySelectorAll(".metaedit-ap-prompt-row")).find((row) => row.textContent.trim() === "done"),
			"Auto Property done row"
		);
		doneRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await Promise.race([autoEditPromise, sleep(5000)]);
		await sleep(500);
		const autoContent = await app.vault.read(autoFile);
		results.autoPropertyContent = autoContent;
		if (!autoContent.includes("ap_status: done")) failures.push("Auto Properties value prompt did not write selected value.");

		const progressFile = await createFreshFile(`${ROOT}/progress.md`, [
			"---",
			"readProgress: 0",
			"---",
			"# Tasks",
			"- [ ] one",
			"- [x] two",
			"Body line should stay literal: readProgress: 0",
			"",
		].join("\n"));
		resetAutomators();
		plugin.settings.ProgressProperties.enabled = true;
		plugin.settings.ProgressProperties.properties = [{ name: "readProgress", type: "Total Tasks" }];
		const progressProps = await plugin.controller.getPropertiesInFile(progressFile);
		await plugin.controller.handleProgressProps(progressProps, progressFile);
		await sleep(500);
		const progressContent = await app.vault.read(progressFile);
		results.progressContent = progressContent;
		if (!/readProgress:\s*"?2"?/.test(progressContent)) failures.push("Progress Properties did not write total task count.");
		if (!progressContent.includes("Body line should stay literal: readProgress: 0")) failures.push("Progress Properties rewrote matching body text.");

		const cardFile = await createFreshFile(`${ROOT}/Project A.md`, "---\nstatus: Backlog\n---\n\nbody\n");
		const boardPath = `${ROOT}/${BOARD_NAME}.md`;
		const backlogBoard = [
			"---",
			"kanban-plugin: board",
			"---",
			"",
			"## Backlog",
			"",
			"- [ ] [[Project A]]",
			"",
			"## In Progress",
			"",
		].join("\n");
		const movedBoard = [
			"---",
			"kanban-plugin: board",
			"---",
			"",
			"## Backlog",
			"",
			"## In Progress",
			"",
			"- [ ] [[Project A]]",
			"",
		].join("\n");
		const boardFile = await createFreshFile(boardPath, backlogBoard);
		resetAutomators();
		plugin.settings.KanbanHelper = {
			enabled: true,
			boards: [{ boardName: BOARD_NAME, property: "status" }],
		};
		plugin.toggleAutomators();
		await sleep(1800);
		await app.vault.modify(boardFile, movedBoard);
		const kanbanContent = await waitFor(async () => {
			const content = await app.vault.read(cardFile);
			return content.includes("status: In Progress") ? content : null;
		}, "Kanban helper to update linked card", 25000);
		results.kanbanCardContent = kanbanContent;
		if (!kanbanContent.includes("status: In Progress")) failures.push("Kanban helper did not update linked card lane.");
	} finally {
		await closeTransientUi();
		resetAutomators();
		plugin.settings = settingsSnapshot;
		plugin.toggleAutomators();
		await cleanupScratch();
	}

	return {
		ok: failures.length === 0,
		failures,
		scratchRoot: ROOT,
		vault: app.vault.getName?.() ?? null,
		obsidianApiVersion: window.apiVersion ?? null,
		metaeditVersion: plugin.manifest?.version ?? null,
		results,
		cleanup,
	};
})()
