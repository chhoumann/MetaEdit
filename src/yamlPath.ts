export type YamlPathSegment = string | number;
export type YamlPath = YamlPathSegment[];

export interface SetYamlPathOptions {
	createParents?: boolean;
	createLeaf?: boolean;
	expectedValue?: unknown;
	validateExpectedValue?: boolean;
}

export class YamlPathError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "YamlPathError";
	}
}

export function parseYamlPath(path: string | readonly YamlPathSegment[]): YamlPath {
	if (Array.isArray(path)) return validateYamlPath(path);
	if (typeof path !== "string") throw new YamlPathError("YAML path must be a string or path segment array.");

	const trimmed = path.trim();
	if (!trimmed) throw new YamlPathError("YAML path cannot be empty.");

	const segments: YamlPath = [];
	for (const part of trimmed.split(".")) {
		if (!part) throw new YamlPathError(`Invalid YAML path '${path}'. Empty path segments are not supported.`);
		readPathPart(part, path, segments);
	}

	return validateYamlPath(segments);
}

export function formatYamlPath(path: readonly YamlPathSegment[]): string {
	const validated = validateYamlPath(path);
	return validated.reduce<string>((label, segment) => {
		if (typeof segment === "number") return `${label}[${segment}]`;
		return label ? `${label}.${segment}` : segment;
	}, "");
}

export function getYamlPath(root: unknown, path: string | readonly YamlPathSegment[]): unknown {
	const resolvedPath = parseYamlPath(path);
	let current = root;

	for (const segment of resolvedPath) {
		current = readYamlPathSegment(current, segment, formatYamlPath(resolvedPath));
	}

	return current;
}

export function setYamlPath(
	root: Record<string, unknown>,
	path: string | readonly YamlPathSegment[],
	value: unknown,
	options: SetYamlPathOptions = {},
): void {
	const resolvedPath = parseYamlPath(path);
	let current: unknown = root;

	for (let idx = 0; idx < resolvedPath.length; idx++) {
		const segment = resolvedPath[idx];
		const isLeaf = idx === resolvedPath.length - 1;
		const location = formatYamlPath(resolvedPath.slice(0, idx + 1));

		if (typeof segment === "string") {
			if (!isPlainYamlObject(current)) {
				throw new YamlPathError(`Cannot write YAML path '${formatYamlPath(resolvedPath)}': '${location}' is not an object.`);
			}

			if (isLeaf) {
				validateLeafWrite(current, segment, resolvedPath, options);
				current[segment] = value;
				return;
			}

			if (!Object.prototype.hasOwnProperty.call(current, segment)) {
				current[segment] = createMissingParent(options, resolvedPath[idx + 1], location);
			}

			current = current[segment];
			continue;
		}

		if (!Array.isArray(current)) {
			throw new YamlPathError(`Cannot write YAML path '${formatYamlPath(resolvedPath)}': '${location}' is not an array.`);
		}
		if (!arrayIndexExists(current, segment)) {
			throw new YamlPathError(`Cannot write YAML path '${formatYamlPath(resolvedPath)}': array index ${segment} is out of range.`);
		}

		if (isLeaf) {
			validateLeafWrite(current, segment, resolvedPath, options);
			current[segment] = value;
			return;
		}

		current = current[segment];
	}
}

export function isPlainYamlObject(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return Object.prototype.toString.call(value) === "[object Object]";
}

export function isYamlScalarLeaf(value: unknown): boolean {
	return !isPlainYamlObject(value) && !Array.isArray(value);
}

export function isYamlParentContainerValue(value: unknown): boolean {
	if (isPlainYamlObject(value)) return true;
	if (!Array.isArray(value)) return false;

	return value.some(item => isPlainYamlObject(item) || Array.isArray(item));
}

function readPathPart(part: string, originalPath: string, segments: YamlPath): void {
	const keyMatch = part.match(/^([^\[\]]+)/);
	if (!keyMatch) throw new YamlPathError(`Invalid YAML path '${originalPath}'. Bracket paths must follow a property name.`);

	segments.push(keyMatch[1]);
	let rest = part.substring(keyMatch[1].length);
	while (rest.length > 0) {
		const indexMatch = rest.match(/^\[(\d+)\]/);
		if (!indexMatch) throw new YamlPathError(`Invalid YAML path '${originalPath}'. Only numeric array indexes are supported.`);
		segments.push(Number(indexMatch[1]));
		rest = rest.substring(indexMatch[0].length);
	}
}

function validateYamlPath(path: readonly YamlPathSegment[]): YamlPath {
	if (path.length === 0) throw new YamlPathError("YAML path cannot be empty.");

	return path.map(segment => {
		if (typeof segment === "string") {
			if (!segment) throw new YamlPathError("YAML path string segments cannot be empty.");
			return segment;
		}

		if (!Number.isInteger(segment) || segment < 0) {
			throw new YamlPathError(`YAML path array index '${segment}' must be a non-negative integer.`);
		}
		return segment;
	});
}

function readYamlPathSegment(current: unknown, segment: YamlPathSegment, pathLabel: string): unknown {
	if (typeof segment === "string") {
		if (!isPlainYamlObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
			throw new YamlPathError(`YAML path '${pathLabel}' does not exist.`);
		}
		return current[segment];
	}

	if (!Array.isArray(current) || !arrayIndexExists(current, segment)) {
		throw new YamlPathError(`YAML path '${pathLabel}' does not exist.`);
	}
	return current[segment];
}

function createMissingParent(options: SetYamlPathOptions, nextSegment: YamlPathSegment, location: string): Record<string, unknown> {
	if (!options.createParents) {
		throw new YamlPathError(`Cannot write YAML path: '${location}' does not exist.`);
	}
	if (typeof nextSegment === "number") {
		throw new YamlPathError(`Cannot create array parent at '${location}'. Array creation is not supported.`);
	}
	return {};
}

function arrayIndexExists(array: unknown[], index: number): boolean {
	return index >= 0 && index < array.length && Object.prototype.hasOwnProperty.call(array, index);
}

function validateLeafWrite(
	current: Record<string, unknown> | unknown[],
	segment: YamlPathSegment,
	path: readonly YamlPathSegment[],
	options: SetYamlPathOptions,
): void {
	const exists = typeof segment === "number"
		? arrayIndexExists(current as unknown[], segment)
		: Object.prototype.hasOwnProperty.call(current, segment);
	const label = formatYamlPath(path);

	if (!exists && options.createLeaf === false) {
		throw new YamlPathError(`Cannot write YAML path '${label}': path does not exist.`);
	}

	const currentValue = typeof segment === "number"
		? (current as unknown[])[segment]
		: (current as Record<string, unknown>)[segment];
	if (exists && options.validateExpectedValue && !yamlValuesEqual(currentValue, options.expectedValue)) {
		throw new YamlPathError(`Cannot write YAML path '${label}': current value changed before update.`);
	}
}

function yamlValuesEqual(left: unknown, right: unknown): boolean {
	if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
	return Object.is(left, right);
}
