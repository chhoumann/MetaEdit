/**
 * Pure, Obsidian-free serialization for plugin settings writes.
 *
 * Every settings mutation and disk flush runs through one queue, so two concurrent
 * writers cannot lost-update a shared in-memory snapshot, and two flushes cannot
 * complete out of order. The latter matters because Obsidian's `Plugin.saveData`
 * serializes its argument synchronously at call time and then writes asynchronously:
 * two unserialized `saveData(settings)` calls each capture a snapshot up front, so
 * whichever write resolves LAST overwrites disk with its (possibly older) snapshot -
 * a silent lost update. Serializing every flush removes that window entirely.
 *
 * This mirrors the controller's per-file `enqueueFileWrite` queue, kept separate from
 * `main.ts` so it stays jsdom-free and directly unit-testable in the `node` env.
 */

/**
 * What a {@link SettingsWriter.update} mutation returns:
 * - a rollback function: the flush will run; if it fails, the function is called to
 *   undo the in-memory change so memory stays consistent with disk;
 * - `false`: nothing changed, so skip the flush (no redundant `data.json` write);
 * - `void`: the flush will run with no rollback available.
 */
export type SettingsMutationResult = (() => void) | false | void;

export class SettingsWriter {
    private tail: Promise<unknown> = Promise.resolve();

    /**
     * @param flush Persist the current in-memory settings to disk. Invoked only at the
     * head of the queue, so it never overlaps another flush.
     */
    constructor(private readonly flush: () => Promise<void>) {}

    /** Flush the current settings, serialized with every other settings write. */
    public save(): Promise<void> {
        return this.enqueue(() => this.flush());
    }

    /**
     * Atomically read-modify-write the settings. `mutate` runs at the head of the
     * queue - so it observes the freshest settings and no other writer can interleave
     * between its read and the flush - then the change is persisted.
     *
     * `mutate` is intentionally SYNCHRONOUS: it applies its change in place and returns
     * a {@link SettingsMutationResult}. Keeping it synchronous is what makes this queue
     * deadlock-free - a mutation can never await a nested settings write while already
     * holding the queue.
     */
    public update(mutate: () => SettingsMutationResult): Promise<void> {
        return this.enqueue(async () => {
            const rollback = mutate();
            if (rollback === false) return; // nothing changed - skip the flush
            try {
                await this.flush();
            } catch (error) {
                if (typeof rollback === "function") rollback();
                throw error;
            }
        });
    }

    private enqueue<T>(task: () => Promise<T> | T): Promise<T> {
        const queued = this.tail.catch(() => undefined).then(task);
        // A rejected task must not break the chain for the next writer, so the tail
        // tracks a swallowed copy while the caller still sees the real rejection.
        this.tail = queued.catch(() => undefined);
        return queued;
    }
}
