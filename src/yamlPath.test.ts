import {describe, expect, it} from "vitest";
import {
	formatYamlPath,
	getYamlPath,
	parseYamlPath,
	setYamlPath,
	YamlPathError,
} from "./yamlPath";

describe("YAML path helpers", () => {
	it("parses and formats dotted object paths with numeric array indexes", () => {
		const path = parseYamlPath("contributors[1].role");

		expect(path).toEqual(["contributors", 1, "role"]);
		expect(formatYamlPath(path)).toBe("contributors[1].role");
	});

	it("reads existing object and array paths", () => {
		const root = {
			metadata: {description: "old"},
			contributors: [
				{name: "Ada", role: "Writer"},
				{name: "Bob", role: "Editor"},
			],
		};

		expect(getYamlPath(root, "metadata.description")).toBe("old");
		expect(getYamlPath(root, ["contributors", 1, "role"])).toBe("Editor");
		expect(() => getYamlPath(root, "contributors[2].name")).toThrow(YamlPathError);
	});

	it("updates existing paths without replacing siblings", () => {
		const root = {
			metadata: {description: "old", scope: "personal"},
			attributes: {one: "something", two: 12345},
			contributors: [
				{name: "Ada", role: "Writer"},
				{name: "Bob", role: "Editor"},
			],
		};

		setYamlPath(root, "metadata.description", "test");
		setYamlPath(root, "attributes.one", "changed");
		setYamlPath(root, ["contributors", 1, "role"], "Proofreader");

		expect(root).toEqual({
			metadata: {description: "test", scope: "personal"},
			attributes: {one: "changed", two: 12345},
			contributors: [
				{name: "Ada", role: "Writer"},
				{name: "Bob", role: "Proofreader"},
			],
		});
	});

	it("creates missing object parents only when requested", () => {
		const root: Record<string, unknown> = {};

		expect(() => setYamlPath(root, "publisher.name", "Meta House")).toThrow(YamlPathError);

		setYamlPath(root, "publisher.name", "Meta House", {createParents: true});

		expect(root).toEqual({publisher: {name: "Meta House"}});
	});

	it("can require an existing leaf for update-style writes", () => {
		const root = {
			metadata: {description: "old"},
		};

		expect(() => setYamlPath(root, "metadata.descrption", "typo", {createLeaf: false}))
			.toThrow("does not exist");

		setYamlPath(root, "metadata.description", "new", {createLeaf: false});

		expect(root).toEqual({metadata: {description: "new"}});
	});

	it("rejects stale update-style writes when the current value changed", () => {
		const root = {
			contributors: [
				{name: "Ada", role: "Writer"},
				{name: "Bob", role: "Editor"},
			],
		};

		expect(() => setYamlPath(root, "contributors[1].role", "Proofreader", {
			createLeaf: false,
			expectedValue: "Writer",
			validateExpectedValue: true,
		})).toThrow("current value changed");

		expect(root.contributors[1].role).toBe("Editor");
	});

	it("rejects scalar parents and out-of-range array writes", () => {
		const root = {
			rating: "4",
			contributors: [{name: "Ada"}],
		};

		expect(() => setYamlPath(root, "rating.stars", 5, {createParents: true}))
			.toThrow("rating");
		expect(() => setYamlPath(root, "contributors[1].role", "Editor", {createParents: true}))
			.toThrow("out of range");
	});

	it("does not create arrays from missing parents", () => {
		const root: Record<string, unknown> = {};

		expect(() => setYamlPath(root, "contributors[0].role", "Writer", {createParents: true}))
			.toThrow("Array creation is not supported");
		expect(root).toEqual({});
	});

	it("supports literal dotted segment names through array paths", () => {
		const root: Record<string, unknown> = {
			metadata: {"child.with.dot": "old"},
		};

		setYamlPath(root, ["metadata", "child.with.dot"], "new");

		expect(getYamlPath(root, ["metadata", "child.with.dot"])).toBe("new");
		expect(root).toEqual({metadata: {"child.with.dot": "new"}});
	});
});
