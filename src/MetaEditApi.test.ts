import {describe, it, expect} from "vitest";
import {MetaEditApi} from "./MetaEditApi";
import {SettingsWriter} from "./settingsWrites";
import type {AutoProperty} from "./Types/autoProperty";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Build the public API over a plugin double whose settings writes use the REAL
// SettingsWriter, so these exercise the actual serialization + rollback path.
function setupApi(flush: () => Promise<void>) {
	const settings = {
		AutoProperties: {enabled: true, properties: [{name: "status", choices: ["todo"]}] as AutoProperty[]},
		EditMode: {mode: "AllSingle", properties: [] as string[]},
	};
	const writer = new SettingsWriter(flush);
	const plugin = {
		app: {},
		settings,
		saveSettings: () => writer.save(),
		updateSettings: (mutate: () => (() => void) | false | void) => writer.update(mutate),
	};
	const api = new MetaEditApi(plugin as never).make();
	return {api, plugin, settings};
}

function setupPrivateApi() {
	return new MetaEditApi({app: {}} as never) as unknown as {
		cloneValue(value: unknown): unknown;
	};
}

describe("MetaEditApi.cloneValue", () => {
	it("copies an own enumerable __proto__ data key without changing the clone prototype", () => {
		const api = setupPrivateApi();
		const source = {
			normal: {
				nested: ["value", {deep: 1}],
			},
		} as Record<string, unknown>;
		const protoValue = {x: 1};
		Object.defineProperty(source, "__proto__", {
			value: protoValue,
			enumerable: true,
			configurable: true,
			writable: true,
		});

		const clone = api.cloneValue(source) as Record<string, unknown>;
		const clonedProtoValue = Object.getOwnPropertyDescriptor(clone, "__proto__")?.value;

		expect(Object.getPrototypeOf(clone)).toBe(Object.prototype);
		expect(Object.prototype.hasOwnProperty.call(clone, "__proto__")).toBe(true);
		expect(clonedProtoValue).toEqual({x: 1});
		expect(clonedProtoValue).not.toBe(protoValue);
		expect(clone.normal).toEqual(source.normal);
		expect(clone.normal).not.toBe(source.normal);

		const clonedNormal = clone.normal as {nested: unknown[]};
		const sourceNormal = source.normal as {nested: unknown[]};
		expect(clonedNormal.nested).toEqual(sourceNormal.nested);
		expect(clonedNormal.nested).not.toBe(sourceNormal.nested);
		expect(clonedNormal.nested[1]).not.toBe(sourceNormal.nested[1]);
	});
});

describe("MetaEditApi.setAutoProperties", () => {
	it("rejects invalid input immediately, without waiting behind a pending settings save", async () => {
		let releaseSave!: () => void;
		const ctx = setupApi(() => new Promise<void>((resolve) => { releaseSave = resolve; }));

		// Occupy the settings queue with a save that has not resolved yet.
		const pendingSave = ctx.plugin.saveSettings();
		await tick();

		// Validation is pure, so a bad payload must reject right away rather than queue
		// behind the in-flight save.
		await expect(
			ctx.api.setAutoProperties([{name: "bad", choices: "not-an-array"} as unknown as AutoProperty]),
		).rejects.toThrow(/array of strings/);

		// The pending save was never touched by the rejected, un-queued validation.
		releaseSave();
		await pendingSave;
	});

	it("does not roll back over a concurrent write when its own flush fails (compare-and-restore)", async () => {
		let failSave!: () => void;
		const ctx = setupApi(() => new Promise<void>((_resolve, reject) => {
			failSave = () => reject(new Error("disk full"));
		}));

		const original = ctx.settings.AutoProperties.properties;
		const replacement = [{name: "status", choices: ["from-elsewhere"]}] as AutoProperty[];

		const setPromise = ctx.api.setAutoProperties([{name: "status", choices: ["from-api"]}]);
		await tick(); // the mutation has assigned its value and is awaiting the flush

		// A concurrent writer replaces the list while the API flush is in flight.
		ctx.settings.AutoProperties.properties = replacement;
		failSave();

		await expect(setPromise).rejects.toThrow("disk full");
		// Rollback must NOT clobber the concurrent replacement back to the original.
		expect(ctx.settings.AutoProperties.properties).toBe(replacement);
		expect(ctx.settings.AutoProperties.properties).not.toBe(original);
	});
});
