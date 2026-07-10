import { describe, expect, it } from "vitest";
import config from "../obsidian-e2e.config.mjs";
import { DEFAULT_SETTINGS } from "../src/Settings/defaultSettings";

describe("obsidian-e2e.config.mjs", () => {
	it("seeds a defaultData that mirrors the real DEFAULT_SETTINGS", () => {
		// Compare the serialized forms — this is exactly what lands in a freshly
		// provisioned vault's data.json, and it fails if a setting is added to
		// src/Settings/defaultSettings.ts without updating the runner config's
		// defaultData seed.
		expect(JSON.parse(JSON.stringify(config.defaultData))).toEqual(
			JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
		);
	});
});
