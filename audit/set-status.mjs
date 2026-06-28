#!/usr/bin/env node
// Patch one or more story status rows, then regenerate the tracker.
//
//   node audit/set-status.mjs '<json>'
//
// where <json> is { "RUN-01": {test:"Pass", desktop:"Pass", errors:"...", fix:"Fixed", retest:"Pass", evidence:"..."}, ... }
// Only the provided fields are overwritten; omitted fields are left as-is.
import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import {execFileSync} from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const statusPath = join(here, "status.json");
const canonical = JSON.parse(readFileSync(join(here, "canonical-stories.json"), "utf8"));
const validIds = new Set(canonical.stories.map((s) => s.id));

const patch = JSON.parse(process.argv[2] ?? "{}");
const status = JSON.parse(readFileSync(statusPath, "utf8"));

const FIELDS = ["test", "errors", "fix", "retest", "desktop", "mobile", "evidence"];
for (const [id, fields] of Object.entries(patch)) {
	if (!validIds.has(id)) throw new Error(`unknown story id: ${id}`);
	const row = (status.rows[id] ??= { test: "Not started", errors: "-", fix: "-", retest: "-", desktop: "-", mobile: "-" });
	for (const [k, v] of Object.entries(fields)) {
		if (!FIELDS.includes(k)) throw new Error(`unknown field "${k}" for ${id}`);
		row[k] = v;
	}
}

writeFileSync(statusPath, JSON.stringify(status, null, "\t") + "\n");
execFileSync("node", [join(here, "generate-tracker.mjs")], {stdio: "inherit"});
