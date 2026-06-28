import { describe, expect, test } from "vitest";
import {
	createMetaEditE2EHarness,
	evalJsonAsync,
	PLUGIN_ID,
	WAIT_OPTS,
} from "./harness";

const getContext = createMetaEditE2EHarness("metaedit-runtime");

describe("MetaEdit runtime", () => {
	test("loads, exposes its API, and registers the run command", async () => {
		const { obsidian } = getContext();

		const state = await obsidian.dev.evalJson<{
			apiMethods: string[];
			hasRunCommand: boolean;
		}>(`
			(() => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				return {
					apiMethods: Object.keys(plugin?.api ?? {}).sort(),
					hasRunCommand: Boolean(app.commands?.commands?.[${JSON.stringify(`${PLUGIN_ID}:metaEditRun`)}]),
				};
			})()
		`);

		expect(state.hasRunCommand).toBe(true);
		expect(state.apiMethods).toEqual([
			"addOrUpdateProperty",
			"addOrUpdateYamlPath",
			"appendDataviewField",
			"autoprop",
			"createYamlProperty",
			"getAutoProperties",
			"getFilesWithProperty",
			"getPropertiesInFile",
			"getPropertyValue",
			"getYamlPath",
			"onMetadataChange",
			"setAutoProperties",
			"update",
			"updateYamlPath",
		]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("creates, reads, and updates a YAML frontmatter property via the API", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("note.md");
		await writeLiveFile(obsidian, notePath, "# Note\n\nBody text.\n");

		// createYamlProperty adds a brand-new frontmatter key to the file.
		await callApi(obsidian, "createYamlProperty", [
			"status",
			"draft",
			notePath,
		]);

		const afterCreate = await sandbox.waitForContent(
			"note.md",
			(value) => value.includes("status: draft"),
			WAIT_OPTS,
		);
		expect(afterCreate).toMatch(/^---\n[\s\S]*status: draft[\s\S]*---/);

		// getPropertyValue reads the value MetaEdit parsed back out of the file.
		const created = await callApi<string>(obsidian, "getPropertyValue", [
			"status",
			notePath,
		]);
		expect(String(created)).toBe("draft");

		// update mutates the existing property in place.
		await callApi(obsidian, "update", ["status", "published", notePath]);

		const afterUpdate = await sandbox.waitForContent(
			"note.md",
			(value) => value.includes("status: published"),
			WAIT_OPTS,
		);
		expect(afterUpdate).toContain("status: published");
		expect(afterUpdate).not.toContain("status: draft");

		const updated = await callApi<string>(obsidian, "getPropertyValue", [
			"status",
			notePath,
		]);
		expect(String(updated)).toBe("published");

		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("adds and updates properties through the public API", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("property-helpers.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nstatus: draft\n---\nowner:: old\n\nBody text.\n",
		);

		await callApi(obsidian, "addOrUpdateProperty", [
			"priority",
			1,
			notePath,
		]);
		await callApi(obsidian, "addOrUpdateProperty", [
			"status",
			"published",
			notePath,
		]);

		const content = await sandbox.waitForContent(
			"property-helpers.md",
			(value) =>
				value.includes("priority: 1") &&
				value.includes("status: published"),
			WAIT_OPTS,
		);

		expect(content).toContain("priority: 1");
		expect(content).toContain("status: published");
		expect(content).toContain("owner:: old");
		expect(content).toContain("\n\nBody text.");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("parses inline fields after an unmatched leading thematic break", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("thematic-break-inline.md");
		await writeLiveFile(obsidian, notePath, "---\nstatus:: open\nbody:: yes\n");

		const state = await evalJsonAsync<{
			frontmatter: unknown;
			frontmatterPosition: unknown;
			properties: { key: string; content: unknown }[];
		}>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				const cache = app.metadataCache.getFileCache(file);
				const props = await plugin.controller.getPropertiesInFile(file);
				return {
					frontmatter: cache?.frontmatter ?? null,
					frontmatterPosition: cache?.frontmatterPosition ?? cache?.frontmatter?.position ?? null,
					properties: props.map((prop) => ({ key: prop.key, content: prop.content })),
				};
			})()
		`,
		);

		expect(state.frontmatter).toBeNull();
		expect(state.frontmatterPosition).toBeNull();
		expect(state.properties).toEqual([
			{ key: "status", content: "open" },
			{ key: "body", content: "yes" },
		]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// #130 follow-up: a note opening with `---` but holding malformed YAML gives
	// Obsidian no usable frontmatter cache, so the parser's live-parse fallback is
	// hit and `parseYaml` throws on the real runtime (the unit stub's parseYaml is
	// permissive and cannot reproduce this). The throw must not abort the note's
	// parse: inline `foo:: bar` and the `#mytag` tag still surface.
	test("surfaces inline and tag metadata when frontmatter YAML is malformed", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("malformed-frontmatter.md");
		await writeLiveFile(obsidian, notePath, "---\nstatus: : :\n---\nfoo:: bar\n#mytag\n");

		const state = await evalJsonAsync<{
			frontmatter: unknown;
			frontmatterPosition: unknown;
			properties: { key: string; content: unknown; type: number }[];
		}>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				// Tags come from the metadata cache, which Obsidian populates
				// asynchronously after the file write. Wait until the tag is indexed
				// so the assertion does not race a slow indexing pass.
				for (let i = 0; i < 50; i++) {
					const tags = app.metadataCache.getFileCache(file)?.tags;
					if (tags?.some((entry) => entry.tag === "#mytag")) break;
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
				const cache = app.metadataCache.getFileCache(file);
				const props = await plugin.controller.getPropertiesInFile(file);
				return {
					frontmatter: cache?.frontmatter ?? null,
					frontmatterPosition: cache?.frontmatterPosition ?? cache?.frontmatter?.position ?? null,
					properties: props.map((prop) => ({ key: prop.key, content: prop.content, type: prop.type })),
				};
			})()
		`,
		);

		// Obsidian reports no usable frontmatter for the malformed block, which is
		// exactly what routes the parser into the throwing live-parse fallback.
		expect(state.frontmatter).toBeNull();
		// The malformed YAML yields no frontmatter properties, but the inline field
		// and the tag are still surfaced rather than lost to an aborted parse.
		expect(state.properties).toEqual([
			{ key: "#mytag", content: "#mytag", type: 2 },
			{ key: "foo", content: "bar", type: 1 },
		]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("updates one numeric YAML property without changing its sibling", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("numeric-frontmatter.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\noutdoor: 0\nreading: 0\n---\n# Baseline\n",
		);

		await callApi(obsidian, "update", ["outdoor", 1, notePath]);

		const content = await sandbox.waitForContent(
			"numeric-frontmatter.md",
			(value) => value.includes("outdoor: 1") && value.includes("reading: 0"),
			WAIT_OPTS,
		);

		expect(content).toContain("outdoor: 1");
		expect(content).toContain("reading: 0");
		expect(content).not.toContain("reading: 1");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("reads and updates existing nested YAML leaves through public APIs (#33, #76)", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("nested-api.md");
		await writeLiveFile(
			obsidian,
			notePath,
			[
				"---",
				"metadata:",
				"  description: old",
				"  scope: personal",
				"attributes:",
				"  one: something",
				"  two: 12345",
				"contributors:",
				"  - name: Ada",
				"    role: Writer",
				"  - name: Bob",
				"    role: Editor",
				"---",
				"body",
			].join("\n"),
		);

		const result = await evalJsonAsync<{
			properties: {
				key: string;
				content: unknown;
				path?: Array<string | number>;
				rootKey?: string;
				isNested?: boolean;
				isVirtual?: boolean;
			}[];
			descriptionBefore: unknown;
			descriptionAfter: unknown;
			contributorRole: unknown;
			publisherName: unknown;
			content: string;
			cache: Record<string, unknown>;
		}>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const api = plugin?.api;
				if (!api) throw new Error("MetaEdit API is not available.");
				const notePath = ${JSON.stringify(notePath)};
				const file = app.vault.getAbstractFileByPath(notePath);
				const properties = (await api.getPropertiesInFile(file)).map((prop) => ({
					key: prop.key,
					content: prop.content,
					path: prop.path,
					rootKey: prop.rootKey,
					isNested: prop.isNested,
					isVirtual: prop.isVirtual,
				}));
				const descriptionBefore = await api.getPropertyValue("metadata.description", file);

				await api.update("metadata.description", "test", file);
				await api.addOrUpdateProperty("attributes.one", "changed", file);
				await api.updateYamlPath("contributors[1].role", "Proofreader", file);
				await api.addOrUpdateYamlPath(["publisher", "name"], "Meta House", file);
				await new Promise((resolve) => setTimeout(resolve, 600));

				return {
					properties,
					descriptionBefore,
					descriptionAfter: await api.getPropertyValue("metadata.description", file),
					contributorRole: await api.getYamlPath(["contributors", 1, "role"], file),
					publisherName: await api.getYamlPath("publisher.name", file),
					content: await app.vault.read(file),
					cache: app.metadataCache.getFileCache(file)?.frontmatter ?? {},
				};
			})()
		`,
		);

		expect(result.properties).toContainEqual({
			key: "metadata.description",
			content: "old",
			path: ["metadata", "description"],
			rootKey: "metadata",
			isNested: true,
			isVirtual: true,
		});
		expect(result.descriptionBefore).toBe("old");
		expect(result.descriptionAfter).toBe("test");
		expect(result.contributorRole).toBe("Proofreader");
		expect(result.publisherName).toBe("Meta House");
		expect(result.cache.metadata).toEqual({ description: "test", scope: "personal" });
		expect(result.cache.attributes).toEqual({ one: "changed", two: 12345 });
		expect(result.cache.contributors).toEqual([
			{ name: "Ada", role: "Writer" },
			{ name: "Bob", role: "Proofreader" },
		]);
		expect(result.cache.publisher).toEqual({ name: "Meta House" });
		expect(result.content).not.toContain("attributes.one:");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("keeps exact dotted YAML keys and inline dotted fields ahead of virtual nested YAML", async () => {
		const { obsidian, sandbox } = getContext();

		const literalPath = sandbox.path("literal-dotted-precedence.md");
		const inlinePath = sandbox.path("inline-dotted-precedence.md");
		await writeLiveFile(
			obsidian,
			literalPath,
			"---\nauthor.name: literal old\nauthor:\n  name: YAML Author\n---\nbody\n",
		);
		await writeLiveFile(
			obsidian,
			inlinePath,
			"---\nauthor:\n  name: YAML Author\n---\nauthor.name:: inline old\n",
		);

		const result = await evalJsonAsync<{
			literalCache: Record<string, unknown>;
			inlineContent: string;
			inlineCache: Record<string, unknown>;
			literalReadBack: unknown;
			inlineReadBack: unknown;
			forcedNestedReadBack: unknown;
		}>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const api = plugin?.api;
				if (!api) throw new Error("MetaEdit API is not available.");
				const literalFile = app.vault.getAbstractFileByPath(${JSON.stringify(literalPath)});
				const inlineFile = app.vault.getAbstractFileByPath(${JSON.stringify(inlinePath)});

				await api.update("author.name", "literal new", literalFile);
				await api.update("author.name", "inline new", inlineFile);
				await api.updateYamlPath("author.name", "YAML forced", inlineFile);
				await new Promise((resolve) => setTimeout(resolve, 600));

				return {
					literalCache: app.metadataCache.getFileCache(literalFile)?.frontmatter ?? {},
					inlineContent: await app.vault.read(inlineFile),
					inlineCache: app.metadataCache.getFileCache(inlineFile)?.frontmatter ?? {},
					literalReadBack: await api.getPropertyValue("author.name", literalFile),
					inlineReadBack: await api.getPropertyValue("author.name", inlineFile),
					forcedNestedReadBack: await api.getYamlPath("author.name", inlineFile),
				};
			})()
		`,
		);

		expect(result.literalCache["author.name"]).toBe("literal new");
		expect(result.literalCache.author).toEqual({ name: "YAML Author" });
		expect(result.literalReadBack).toBe("literal new");
		expect(result.inlineContent).toContain("author.name:: inline new");
		expect(result.inlineCache.author).toEqual({ name: "YAML forced" });
		expect(result.inlineReadBack).toBe("inline new");
		expect(result.forcedNestedReadBack).toBe("YAML forced");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("keeps missing dotted legacy addOrUpdateProperty literal but explicit path writes can create parents", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("missing-dotted.md");
		await writeLiveFile(obsidian, notePath, "---\nstatus: draft\n---\nbody\n");

		const result = await evalJsonAsync<{
			cache: Record<string, unknown>;
			nestedValue: unknown;
			literalValue: unknown;
		}>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const api = plugin?.api;
				if (!api) throw new Error("MetaEdit API is not available.");
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});

				await api.addOrUpdateProperty("missing.path", "literal", file);
				await api.addOrUpdateYamlPath("created.path", "nested", file);
				await new Promise((resolve) => setTimeout(resolve, 600));

				return {
					cache: app.metadataCache.getFileCache(file)?.frontmatter ?? {},
					nestedValue: await api.getYamlPath("created.path", file),
					literalValue: await api.getPropertyValue("missing.path", file),
				};
			})()
		`,
		);

		expect(result.cache["missing.path"]).toBe("literal");
		expect(result.cache.missing).toBeUndefined();
		expect(result.cache.created).toEqual({ path: "nested" });
		expect(result.nestedValue).toBe("nested");
		expect(result.literalValue).toBe("literal");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("rejects scalar-parent and stale array nested writes without data loss", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("nested-rejections.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nrating: '4'\ncontributors:\n  - name: Ada\n    role: Writer\n---\nbody\n",
		);

		const result = await evalJsonAsync<{
			scalarError: string;
			arrayError: string;
			cache: Record<string, unknown>;
			content: string;
		}>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const api = plugin?.api;
				if (!api) throw new Error("MetaEdit API is not available.");
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				let scalarError = "";
				let arrayError = "";

				try {
					await api.addOrUpdateYamlPath("rating.stars", 5, file);
				} catch (error) {
					scalarError = error.message;
				}

				try {
					await api.updateYamlPath("contributors[1].role", "Editor", file);
				} catch (error) {
					arrayError = error.message;
				}

				await new Promise((resolve) => setTimeout(resolve, 600));
				return {
					scalarError,
					arrayError,
					cache: app.metadataCache.getFileCache(file)?.frontmatter ?? {},
					content: await app.vault.read(file),
				};
			})()
		`,
		);

		expect(result.scalarError).toContain("rating");
		expect(result.arrayError).toContain("out of range");
		expect(result.cache.rating).toBe("4");
		expect(result.cache.contributors).toEqual([{ name: "Ada", role: "Writer" }]);
		expect(result.content).not.toContain("stars:");
		expect(result.content).not.toContain("Editor");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("rejects stale in-range array path writes instead of updating the wrong item", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("nested-stale-array.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\ncontributors:\n  - name: Ada\n    role: Writer\n  - name: Bob\n    role: Editor\n---\nbody\n",
		);

		const result = await evalJsonAsync<{
			errorMessage: string;
			cache: Record<string, unknown>;
			content: string;
		}>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				const props = await plugin.controller.getPropertiesInFile(file);
				const staleBobRole = props.find((prop) => prop.key === "contributors[1].role");
				if (!staleBobRole) throw new Error("contributors[1].role was not parsed.");

				await app.fileManager.processFrontMatter(file, (frontmatter) => {
					frontmatter.contributors.unshift({ name: "Carol", role: "Reviewer" });
				});

				let errorMessage = "";
				try {
					await plugin.controller.updatePropertyInFile(staleBobRole, "Proofreader", file);
				} catch (error) {
					errorMessage = error.message;
				}
				await new Promise((resolve) => setTimeout(resolve, 600));

				return {
					errorMessage,
					cache: app.metadataCache.getFileCache(file)?.frontmatter ?? {},
					content: await app.vault.read(file),
				};
			})()
		`,
		);

		expect(result.errorMessage).toContain("current value changed");
		expect(result.cache.contributors).toEqual([
			{ name: "Carol", role: "Reviewer" },
			{ name: "Ada", role: "Writer" },
			{ name: "Bob", role: "Editor" },
		]);
		expect(result.content).not.toContain("Proofreader");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("edits nested YAML leaf rows through the real MetaEdit suggester", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("nested-picker.md");
		await writeLiveFile(
			obsidian,
			notePath,
			[
				"---",
				"status: draft",
				"attributes:",
				"  one: something",
				"  two: 12345",
				"contributors:",
				"  - name: Ada",
				"    role: Writer",
				"  - name: Bob",
				"    role: Editor",
				"---",
				"body",
			].join("\n"),
		);

		const menuResult = await evalJsonAsync<{
			keys: string[];
			nestedButtonCount: number;
		}>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
				const waitFor = async (selector, predicate = () => true) => {
					const start = Date.now();
					while (Date.now() - start < 5000) {
						const found = Array.from(document.querySelectorAll(selector)).find(predicate);
						if (found) return found;
						await sleep(80);
					}
					throw new Error("Timed out waiting for " + selector);
				};
				const itemText = (item) => {
					const textEl = item.querySelector(".suggestion-item-text") || item;
					return (textEl.textContent || "").trim();
				};

				await plugin.runMetaEditForFile(file);
				await waitFor(".suggestion-item");
				await sleep(150);

				const items = Array.from(document.querySelectorAll(".suggestion-item"));
				const keys = items.map(itemText);
				const nestedItem = items.find((item) => itemText(item) === "attributes.one");
				if (!nestedItem) throw new Error("Nested attributes.one row was not rendered.");
				const nestedButtonCount = nestedItem.querySelectorAll("button").length;

				app.workspace.activeModal?.close?.();
				for (const button of Array.from(document.querySelectorAll(".modal-close-button"))) {
					button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				}
				for (const element of Array.from(document.querySelectorAll(".suggestion-container, .suggestion-item"))) {
					element.remove();
				}
				await sleep(50);

				return {
					keys,
					nestedButtonCount,
				};
			})()
		`,
		);

		const editResult = await evalJsonAsync<{
			cache: Record<string, unknown>;
			content: string;
		}>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
				const waitFor = async (selector, predicate = () => true) => {
					const start = Date.now();
					while (Date.now() - start < 5000) {
						const found = Array.from(document.querySelectorAll(selector)).find(predicate);
						if (found) return found;
						await sleep(80);
					}
					throw new Error("Timed out waiting for " + selector);
				};

				for (const button of Array.from(document.querySelectorAll(".modal-close-button"))) {
					button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				}
				await sleep(100);

				const props = await plugin.controller.getPropertiesInFile(file);
				const property = props.find((prop) => prop.key === "attributes.one");
				if (!property) throw new Error("Nested attributes.one property was not parsed.");
				const editPromise = plugin.controller.editMetaElement(property, props, file);
				const input = await waitFor(".metaEditPromptInput");
				input.value = "edited";
				input.dispatchEvent(new Event("input", { bubbles: true }));
				input.dispatchEvent(new KeyboardEvent("keydown", {
					key: "Enter",
					code: "Enter",
					keyCode: 13,
					which: 13,
					bubbles: true,
					cancelable: true,
				}));
				await editPromise;
				await waitFor("body", () => !document.querySelector(".metaEditPromptInput"));
				await waitFor("body", () => {
					const cache = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
					return cache.attributes?.one === "edited";
				});

				return {
					cache: app.metadataCache.getFileCache(file)?.frontmatter ?? {},
					content: await app.vault.read(file),
				};
			})()
		`,
		);

		expect(menuResult.keys).toContain("attributes.one");
		expect(menuResult.keys).toContain("attributes.two");
		expect(menuResult.keys).toContain("contributors[1].role");
		expect(menuResult.keys).not.toContain("attributes");
		expect(menuResult.keys).not.toContain("contributors");
		expect(menuResult.nestedButtonCount).toBe(0);
		expect(editResult.cache.attributes).toEqual({ one: "edited", two: 12345 });
		expect(editResult.content).not.toContain("attributes.one:");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("sets Auto Properties through the public API without exposing mutable settings", async () => {
		const { obsidian } = getContext();

			const state = await evalJsonAsync<{
				returnedChoices: string[];
				returnedType: string | undefined;
				returnedDescription: string | undefined;
				savedChoices: string[];
				savedType: string | undefined;
				savedDescription: string | undefined;
				invalidMessage: string;
				settingsAfterInvalid: { name: string; choices: string[]; type?: string; description?: string }[];
			}>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const api = plugin?.api;
				if (!api) throw new Error("MetaEdit API is not available.");

					await api.setAutoProperties([
						{ name: "", choices: [""] },
						{
							name: "Status",
							choices: ["Draft", "Done"],
							description: "Workflow state",
							type: "Single",
						},
						{ name: "Status", choices: ["Duplicate"] },
					]);

				const returned = api.getAutoProperties();
				returned[1].choices.push("Leaked");

				let invalidMessage = "";
				try {
					await api.setAutoProperties([
						{ name: "Broken", choices: "not-an-array" },
					]);
				}
				catch (error) {
					invalidMessage = error.message;
				}

				const saved = await plugin.loadData();

					return {
						returnedChoices: api.getAutoProperties()[1].choices,
						returnedType: api.getAutoProperties()[1].type,
						returnedDescription: api.getAutoProperties()[1].description,
						savedChoices: saved.AutoProperties.properties[1].choices,
						savedType: saved.AutoProperties.properties[1].type,
						savedDescription: saved.AutoProperties.properties[1].description,
						invalidMessage,
						settingsAfterInvalid: plugin.settings.AutoProperties.properties,
					};
			})()
		`,
		);

			expect(state.returnedChoices).toEqual(["Draft", "Done"]);
			expect(state.returnedType).toBe("Single");
			expect(state.returnedDescription).toBe("Workflow state");
			expect(state.savedChoices).toEqual(["Draft", "Done"]);
			expect(state.savedType).toBe("Single");
			expect(state.savedDescription).toBe("Workflow state");
			expect(state.invalidMessage).toContain("choices must be an array of strings");
			expect(state.settingsAfterInvalid).toEqual([
				{ name: "", choices: [""] },
				{
					name: "Status",
					choices: ["Draft", "Done"],
					description: "Workflow state",
					type: "Single",
				},
				{ name: "Status", choices: ["Duplicate"] },
			]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("notifies metadata changes with parsed properties and cleans up subscriptions", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("metadata-listener.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nstatus: draft\n---\ninline:: one\n",
		);

		const state = await evalJsonAsync<{
			events: {
				status: unknown;
				inline: unknown;
				previousProperties: number | null;
			}[];
			countBeforeUnsubscribe: number;
			countAfterUnsubscribe: number;
		}>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const api = plugin?.api;
				if (!api) throw new Error("MetaEdit API is not available.");

				const notePath = ${JSON.stringify(notePath)};
				const file = app.vault.getAbstractFileByPath(notePath);
				const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
				const waitFor = async (predicate) => {
					const started = Date.now();
					while (Date.now() - started < 5000) {
						if (predicate()) return;
						await sleep(100);
					}
					throw new Error("Timed out waiting for metadata listener.");
				};
				const events = [];
				const unsubscribe = api.onMetadataChange((change) => {
					if (change.file.path !== notePath) return;

					const status = change.properties.find((property) => property.key === "status");
					const inline = change.properties.find((property) => property.key === "inline");
					events.push({
						status: status?.content,
						inline: inline?.content,
						previousProperties: change.previousProperties?.length ?? null,
					});
				});

				await api.update("status", "done", notePath);
				await waitFor(() => events.some((event) => event.status === "done" && event.inline === "one"));

				const countBeforeUnsubscribe = events.length;
				unsubscribe();
				await api.update("status", "closed", notePath);
				await sleep(800);

				return {
					events,
					countBeforeUnsubscribe,
					countAfterUnsubscribe: events.length,
				};
			})()
		`,
		);

		expect(state.events.some(event => event.status === "done" && event.inline === "one")).toBe(true);
		expect(state.countAfterUnsubscribe).toBe(state.countBeforeUnsubscribe);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("keeps metadata change event data, cache, and properties in the same snapshot", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("metadata-burst.md");
		await writeLiveFile(obsidian, notePath, "---\nstatus: zero\n---\nbody\n");

		const state = await evalJsonAsync<{
			events: {
				dataStatus: string | null;
				cacheStatus: unknown;
				propStatus: unknown;
				previousStatus: unknown;
			}[];
		}>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const api = plugin?.api;
				if (!api) throw new Error("MetaEdit API is not available.");

				const notePath = ${JSON.stringify(notePath)};
				const file = app.vault.getAbstractFileByPath(notePath);
				const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
				const statusFromData = (data) => data.match(/status:\\s*([^\\n\\r]+)/)?.[1] ?? null;
				const events = [];
				const unsubscribe = api.onMetadataChange(async (change) => {
					if (change.file.path !== notePath) return;
					events.push({
						dataStatus: statusFromData(change.data),
						cacheStatus: change.cache?.frontmatter?.status ?? null,
						propStatus: change.properties.find((property) => property.key === "status")?.content ?? null,
						previousStatus: change.previousProperties?.find((property) => property.key === "status")?.content ?? null,
					});
					await sleep(150);
				});

				try {
					await app.vault.modify(file, "---\\nstatus: one\\n---\\nbody\\n");
					await sleep(20);
					await app.vault.modify(file, "---\\nstatus: two\\n---\\nbody\\n");

					const started = Date.now();
					while (Date.now() - started < 5000 && events.length < 2) {
						await sleep(100);
					}
					await sleep(300);
					return { events };
				} finally {
					unsubscribe();
				}
			})()
		`,
		);

		expect(state.events).toEqual([
			{
				dataStatus: "one",
				cacheStatus: "one",
				propStatus: "one",
				previousStatus: null,
			},
			{
				dataStatus: "two",
				cacheStatus: "two",
				propStatus: "two",
				previousStatus: "one",
			},
		]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("metadata change events include a user frontmatter key named position", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("metadata-position.md");
		await writeLiveFile(obsidian, notePath, "---\nposition: goalkeeper\n---\nbody\n");

		const state = await evalJsonAsync<{ position: unknown; keys: string[] }>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const api = plugin?.api;
				if (!api) throw new Error("MetaEdit API is not available.");

				const notePath = ${JSON.stringify(notePath)};
				const file = app.vault.getAbstractFileByPath(notePath);
				const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
				const events = [];
				const unsubscribe = api.onMetadataChange((change) => {
					if (change.file.path !== notePath) return;
					events.push(change.properties);
				});

				try {
					await api.update("position", "striker", file);
					const started = Date.now();
					while (Date.now() - started < 5000 && events.length === 0) {
						await sleep(100);
					}

					const latest = events[events.length - 1] ?? [];
					const position = latest.find((property) => property.key === "position")?.content ?? null;
					return {
						position,
						keys: latest.map((property) => property.key),
					};
				} finally {
					unsubscribe();
				}
			})()
		`,
		);

		expect(state.position).toBe("striker");
		expect(state.keys).toContain("position");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("updates YAML frontmatter through sequential API calls without corrupting fences", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("sequential-frontmatter.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nstatus: backlog\nstarted: old\nlastRead: old\nupdated: old\n---\n# Book\n",
		);

		await callApi(obsidian, "update", ["status", "reading", notePath]);
		await callApi(obsidian, "update", ["started", "2026-06-27", notePath]);
		await callApi(obsidian, "update", [
			"lastRead",
			"2026-06-27T12:00:00",
			notePath,
		]);
		await callApi(obsidian, "update", [
			"updated",
			"2026-06-27T12:00:00",
			notePath,
		]);

		const content = await sandbox.waitForContent(
			"sequential-frontmatter.md",
			(value) =>
				value.includes("status: reading") &&
				value.includes("started: 2026-06-27") &&
				value.includes("lastRead: 2026-06-27T12:00:00") &&
				value.includes("updated: 2026-06-27T12:00:00"),
			WAIT_OPTS,
		);

		expect(content).toContain("---\n# Book");
		expect(content).not.toContain("----");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("serializes concurrent YAML property creation for one file", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("concurrent-create.md");
		await writeLiveFile(obsidian, notePath, "Note Content\n");

		await evalJsonAsync<void>(
			obsidian,
			`
			(async () => {
				const api = app.plugins.plugins.${PLUGIN_ID}?.api;
				if (!api) throw new Error("MetaEdit API is not available.");
				const notePath = ${JSON.stringify(notePath)};
				await Promise.all([
					api.createYamlProperty("AB", "1", notePath),
					api.createYamlProperty("BB", "1", notePath),
					api.createYamlProperty("CB", "1", notePath),
				]);
			})()
		`,
		);

		const content = await sandbox.waitForContent(
			"concurrent-create.md",
			(value) =>
				value.includes("AB:") &&
				value.includes("BB:") &&
				value.includes("CB:"),
			WAIT_OPTS,
		);

		expect(content.match(/^---$/gm)).toHaveLength(2);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("updates only the exact inline field key", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("inline-substring.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"airingstatus:: airing\nstatus:: backlog\nmy-key:: old\nprogress (%):: old\n",
		);

		await callApi(obsidian, "update", ["status", "complete", notePath]);
		await callApi(obsidian, "update", ["my-key", "new", notePath]);
		await callApi(obsidian, "update", ["progress (%)", "done", notePath]);

		const content = await sandbox.waitForContent(
			"inline-substring.md",
			(value) =>
				value.includes("status:: complete") &&
				value.includes("my-key:: new") &&
				value.includes("progress (%):: done"),
			WAIT_OPTS,
		);

		expect(content).toContain("airingstatus:: airing");
		expect(content).toContain("status:: complete");
		expect(content).toContain("my-key:: new");
		expect(content).toContain("progress (%):: done");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("preserves CRLF terminators when updating a full-line inline field", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("inline-crlf.md");
		await writeLiveFile(obsidian, notePath, "status:: open\r\nother:: keep\r\n");

		await callApi(obsidian, "update", ["status", "closed", notePath]);

		const content = await sandbox.waitForContent(
			"inline-crlf.md",
			(value) => value.includes("status:: closed"),
			WAIT_OPTS,
		);

		expect(content).toBe("status:: closed\r\nother:: keep\r\n");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("preserves the rest of an inline multi-value list when editing the first item", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("first-inline-item.md");
		await writeLiveFile(obsidian, notePath, "Tags:: #a, #B, #c, #d\n");

		const content = await evalJsonAsync<string>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
				const originalMode = plugin.settings.EditMode.mode;
				plugin.settings.EditMode.mode = "All Multi";

				try {
					const props = await plugin.controller.getPropertiesInFile(file);
					const property = props.find((prop) => prop.key === "Tags");
					if (!property) throw new Error("Tags property was not parsed.");

					const editPromise = plugin.controller.multiValueMode(property, file);
					const waitFor = async (selector, predicate = () => true) => {
						const start = Date.now();
						while (Date.now() - start < 5000) {
							const found = Array.from(document.querySelectorAll(selector)).find(predicate);
							if (found) return found;
							await sleep(100);
						}
						throw new Error("Timed out waiting for " + selector);
					};

					const firstItem = await waitFor(
						".suggestion-item",
						(el) => el.textContent?.trim() === "#a",
					);
					firstItem.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
					firstItem.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
					firstItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));

					const input = await waitFor(".metaEditPromptInput");
					input.value = "#A";
					input.dispatchEvent(new Event("input", { bubbles: true }));
					input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
					await editPromise;
					await sleep(300);

					return await app.vault.read(file);
				}
				finally {
					plugin.settings.EditMode.mode = originalMode;
				}
			})()
		`,
		);

		expect(content).toBe("Tags:: #A, #B, #c, #d\n");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("progress properties update YAML without rewriting matching body text", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("progress-body.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nreadProgress: 0\n---\n# Tasks\n- [ ] one\n- [x] two\nBody line should stay literal: readProgress: 0\n",
		);

		const content = await evalJsonAsync<string>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				plugin.settings.ProgressProperties.enabled = true;
				plugin.settings.ProgressProperties.properties = [{ name: "readProgress", type: "Total Tasks" }];
				const props = await plugin.controller.getPropertiesInFile(file);

				try {
					await plugin.controller.handleProgressProps(props, file);
					await new Promise((resolve) => setTimeout(resolve, 300));
					return await app.vault.read(file);
				}
				finally {
					plugin.settings.ProgressProperties.enabled = false;
					plugin.settings.ProgressProperties.properties = [];
				}
			})()
		`,
		);

		expect(content).toMatch(/readProgress: "?2"?/);
		expect(content).toContain("Body line should stay literal: readProgress: 0");
		expect(content).not.toContain("Body line should stay literal: readProgress: 2");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("progress properties update nested YAML leaf paths", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("progress-nested.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\ntasks:\n  total: 0\n---\n# Tasks\n- [ ] one\n- [x] two\n",
		);

		const content = await evalJsonAsync<string>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				plugin.settings.ProgressProperties.enabled = true;
				plugin.settings.ProgressProperties.properties = [{ name: "tasks.total", type: "Total Tasks" }];
				const props = await plugin.controller.getPropertiesInFile(file);

				try {
					await plugin.controller.handleProgressProps(props, file);
					await new Promise((resolve) => setTimeout(resolve, 300));
					return await app.vault.read(file);
				}
				finally {
					plugin.settings.ProgressProperties.enabled = false;
					plugin.settings.ProgressProperties.properties = [];
				}
			})()
		`,
		);

		expect(content).toMatch(/tasks:\n  total: "?2"?/);
		expect(content).not.toContain("tasks.total:");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});

// Invoke a MetaEdit public-API method inside the running app and return its
// (JSON-serializable) result.
async function callApi<T = unknown>(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	method: string,
	args: unknown[],
): Promise<T> {
	return await evalJsonAsync<T>(
		obsidian,
		`
		(async () => {
			const api = app.plugins.plugins.${PLUGIN_ID}?.api;
			if (!api) throw new Error("MetaEdit API is not available.");
			return await api[${JSON.stringify(method)}](...${JSON.stringify(args)});
		})()
	`,
	);
}

async function writeLiveFile(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	path: string,
	content: string,
): Promise<void> {
	await evalJsonAsync<void>(
		obsidian,
		`
		(async () => {
			const path = ${JSON.stringify(path)};
			const content = ${JSON.stringify(content)};
			const parts = path.split("/");
			let current = "";
			for (const part of parts.slice(0, -1)) {
				current = current ? current + "/" + part : part;
				if (!app.vault.getAbstractFileByPath(current)) {
					try {
						await app.vault.createFolder(current);
					}
					catch (error) {
						if (!String(error.message).includes("Folder already exists")) {
							throw error;
						}
					}
				}
			}

			const existing = app.vault.getAbstractFileByPath(path);
			if (existing) await app.vault.delete(existing);
			await app.vault.create(path, content);
			await new Promise((resolve) => setTimeout(resolve, 500));
		})()
	`,
	);
}
