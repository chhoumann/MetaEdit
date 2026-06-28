(async () => {
	const PLUGIN_ID = "metaedit";
	const SCRATCH_DIR = "MetaEdit Mobile Debug";
	const NOTE_PATH = `${SCRATCH_DIR}/issue-99-frontmatter.md`;
	const CLEANUP = true;
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const failures = [];
	const cleanup = { attempted: false, deleted: [], errors: [] };

	const ensureFolder = async (path) => {
		if (!app.vault.getAbstractFileByPath(path)) {
			await app.vault.createFolder(path);
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
	const waitFor = async (predicate, label, timeout = 10000) => {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			const value = await predicate();
			if (value) return value;
			await sleep(120);
		}
		throw new Error(`Timed out waiting for ${label}`);
	};
	const cleanupScratch = async () => {
		if (!CLEANUP) return cleanup;
		cleanup.attempted = true;
		try {
			const existing = app.vault.getAbstractFileByPath(NOTE_PATH);
			if (existing) {
				await app.vault.delete(existing);
				cleanup.deleted.push(NOTE_PATH);
			}
			await deleteEmptyFolder(SCRATCH_DIR);
		} catch (error) {
			cleanup.errors.push(String(error?.stack || error));
		}
		return cleanup;
	};

	const plugin = app.plugins.plugins[PLUGIN_ID];
	if (!plugin?.api) throw new Error("MetaEdit plugin API is not available.");

	try {
		await ensureFolder(SCRATCH_DIR);
		await deleteIfExists(NOTE_PATH);
		const file = await app.vault.create(NOTE_PATH, [
			"---",
			"mobile_status: initial",
			"mobile_empty:",
			"mobile_keep: stay",
			"---",
			"# MetaEdit mobile issue #99 scratch",
			"",
			"inline_mobile:: inline initial",
			"",
		].join("\n"));
		await waitFor(
			() => app.metadataCache.getFileCache(file)?.frontmatter,
			"initial frontmatter cache"
		);

		const initialEmpty = await plugin.api.getPropertyValue("mobile_empty", file);
		await plugin.api.addOrUpdateProperty("mobile_new", "created-on-mobile", file);
		await plugin.api.update("mobile_status", "updated-on-mobile", file);
		await plugin.api.addOrUpdateProperty("mobile_clear", "set-before-clear", file);
		await plugin.api.update("mobile_clear", null, file);
		await sleep(600);

		const properties = await plugin.api.getPropertiesInFile(file);
		const rawContent = await app.vault.read(file);
		const cache = app.metadataCache.getFileCache(file);
		const values = {
			initialEmpty,
			status: await plugin.api.getPropertyValue("mobile_status", file),
			created: await plugin.api.getPropertyValue("mobile_new", file),
			cleared: await plugin.api.getPropertyValue("mobile_clear", file),
			keep: await plugin.api.getPropertyValue("mobile_keep", file),
		};
		const keys = properties.map((property) => property.key);
		const frontmatterKeys = Object.keys(cache?.frontmatter ?? {});

		if (values.initialEmpty === "null") failures.push("Blank YAML value read back as literal string \"null\".");
		if (values.initialEmpty !== null) failures.push(`Blank YAML value should read as null, got ${JSON.stringify(values.initialEmpty)}.`);
		if (values.cleared === "null") failures.push("Cleared YAML value read back as literal string \"null\".");
		if (values.status !== "updated-on-mobile") failures.push(`mobile_status read-back mismatch: ${values.status}`);
		if (values.created !== "created-on-mobile") failures.push(`mobile_new read-back mismatch: ${values.created}`);
		if (values.cleared !== null) failures.push(`mobile_clear should read as null after clearing, got ${JSON.stringify(values.cleared)}.`);
		if (keys.includes("position")) failures.push("MetaEdit parsed Obsidian's legacy frontmatter.position as a real property.");
		if (/^position\s*:/m.test(rawContent)) failures.push("Raw note content contains a spurious top-level position property.");

		await cleanupScratch();
		return {
			ok: failures.length === 0,
			failures,
			notePath: NOTE_PATH,
			vault: app.vault.getName?.() ?? null,
			obsidianApiVersion: window.apiVersion ?? null,
			metaeditVersion: plugin.manifest?.version ?? null,
			values,
			frontmatterKeys,
			propertyKeys: keys,
			rawContent,
			cleanup,
		};
	} catch (error) {
		await cleanupScratch();
		throw error;
	}
})()
