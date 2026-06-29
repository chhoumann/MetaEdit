import {describe, it, expect} from "vitest";
import {SettingsWriter} from "./settingsWrites";

interface Settings {
	enabled: boolean;
	choices: string[];
}

// A controllable "disk": each flush() takes a SYNCHRONOUS snapshot of the live
// settings (mirroring Obsidian's saveData, which serializes its argument up front and
// writes asynchronously) and commits that snapshot only when its deferred is released.
// Tests can therefore release flushes in any order and observe what landed on disk.
function makeDisk(settings: Settings) {
	const pending: Array<{snapshot: Settings; release: () => void}> = [];
	let inFlight = 0;
	let maxInFlight = 0;
	let flushCount = 0;
	const committed: Settings = {enabled: settings.enabled, choices: [...settings.choices]};

	const flush = (): Promise<void> => {
		flushCount++;
		const snapshot: Settings = {enabled: settings.enabled, choices: [...settings.choices]};
		inFlight++;
		maxInFlight = Math.max(maxInFlight, inFlight);
		return new Promise<void>((resolve) => {
			pending.push({
				snapshot,
				release: () => {
					committed.enabled = snapshot.enabled;
					committed.choices = [...snapshot.choices];
					inFlight--;
					resolve();
				},
			});
		});
	};

	const failingFlush = (): Promise<void> => {
		flushCount++;
		return Promise.reject(new Error("disk full"));
	};

	return {
		flush,
		failingFlush,
		committed,
		pending,
		get maxInFlight() { return maxInFlight; },
		get flushCount() { return flushCount; },
	};
}

// Drain pending microtasks so queued tasks reach their flush() call.
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("SettingsWriter", () => {
	it("CONTROL: unserialized out-of-order flushes silently drop an update (the bug)", async () => {
		const settings: Settings = {enabled: false, choices: ["a"]};
		const disk = makeDisk(settings);

		// Two writers flush directly, without serialization.
		settings.choices = ["a", "X"];
		const choiceFlush = disk.flush();      // snapshot {enabled:false, choices:[a,X]}
		settings.enabled = true;
		const toggleFlush = disk.flush();      // snapshot {enabled:true,  choices:[a,X]}

		// The toggle's write resolves FIRST, the choice write resolves LAST.
		disk.pending[1].release();
		disk.pending[0].release();
		await Promise.all([choiceFlush, toggleFlush]);

		// The later-resolving choice flush overwrote disk with its stale snapshot, so
		// the toggle (enabled=true) is lost even though memory says true.
		expect(disk.maxInFlight).toBe(2);
		expect(disk.committed.enabled).toBe(false);
	});

	it("serializes update() writes so flushes never overlap and no update is lost", async () => {
		const settings: Settings = {enabled: false, choices: ["a"]};
		const disk = makeDisk(settings);
		const writer = new SettingsWriter(disk.flush);

		const p1 = writer.update(() => {
			settings.choices = ["a", "X"];
			return () => { settings.choices = ["a"]; };
		});
		const p2 = writer.update(() => {
			settings.enabled = true;
			return () => { settings.enabled = false; };
		});

		await tick();
		// Serialized: only the first flush has started even though both are enqueued.
		expect(disk.pending.length).toBe(1);

		disk.pending[0].release();
		await tick();
		expect(disk.pending.length).toBe(2);
		disk.pending[1].release();

		await Promise.all([p1, p2]);
		expect(disk.maxInFlight).toBe(1);
		expect(disk.committed).toEqual({enabled: true, choices: ["a", "X"]});
	});

	it("serializes save() against update()", async () => {
		const settings: Settings = {enabled: false, choices: ["a"]};
		const disk = makeDisk(settings);
		const writer = new SettingsWriter(disk.flush);

		const p1 = writer.update(() => { settings.choices = ["a", "X"]; });
		settings.enabled = true; // a scalar toggle mutates in place, then flushes
		const p2 = writer.save();

		await tick();
		expect(disk.pending.length).toBe(1);
		disk.pending[0].release();
		await tick();
		disk.pending[1].release();

		await Promise.all([p1, p2]);
		expect(disk.maxInFlight).toBe(1);
		expect(disk.committed).toEqual({enabled: true, choices: ["a", "X"]});
	});

	it("skips the flush when a mutation reports no change (returns false)", async () => {
		const settings: Settings = {enabled: false, choices: ["a"]};
		const disk = makeDisk(settings);
		const writer = new SettingsWriter(disk.flush);

		await writer.update(() => false);

		expect(disk.flushCount).toBe(0);
		expect(disk.committed).toEqual({enabled: false, choices: ["a"]});
	});

	it("rolls back the in-memory change when the flush fails", async () => {
		const settings: Settings = {enabled: false, choices: ["a"]};
		const disk = makeDisk(settings);
		const writer = new SettingsWriter(disk.failingFlush);

		await expect(writer.update(() => {
			settings.choices = ["a", "X"];
			return () => { settings.choices = ["a"]; };
		})).rejects.toThrow("disk full");

		// Rollback restored memory so it stays consistent with (unchanged) disk.
		expect(settings.choices).toEqual(["a"]);
		expect(disk.committed.choices).toEqual(["a"]);
	});

	it("keeps serving later writers after one task rejects", async () => {
		const settings: Settings = {enabled: false, choices: ["a"]};
		const disk = makeDisk(settings);
		let failNext = true;
		const writer = new SettingsWriter(() => {
			if (failNext) { failNext = false; return Promise.reject(new Error("transient")); }
			return disk.flush();
		});

		const failed = writer.update(() => {
			settings.choices = ["a", "X"];
			return () => { settings.choices = ["a"]; };
		});
		const succeeded = writer.update(() => { settings.choices = ["a", "Y"]; });

		await expect(failed).rejects.toThrow("transient");
		await tick();
		expect(disk.pending.length).toBe(1);
		disk.pending[0].release();
		await succeeded;

		expect(disk.committed.choices).toEqual(["a", "Y"]);
	});
});
