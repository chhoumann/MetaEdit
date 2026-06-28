<script lang="ts">
    import {untrack} from "svelte";
    import {setIcon} from "obsidian";
    import type {AutoProperty} from "../../Types/autoProperty";
    import {multiSelectOptions, normalizeChoices, toValueArray} from "../../autoProperties";

    let {
        autoProperty,
        isMulti = false,
        currentValue = null,
        onSubmit,
        onSaveChoices,
    }: {
        autoProperty: AutoProperty;
        isMulti?: boolean;
        currentValue?: unknown;
        onSubmit: (value: string | string[]) => void;
        onSaveChoices: (values: string[]) => void | Promise<void>;
    } = $props();

    interface SingleItem {
        kind: "choice" | "use" | "save";
        value: string;
        label: string;
    }

    const initialAutoProperty = untrack(() => autoProperty);
    const initialIsMulti = untrack(() => isMulti);
    const initialCurrentValue = untrack(() => currentValue);
    const choices = normalizeChoices(initialAutoProperty.choices);

    let inputEl = $state<HTMLInputElement>();
    let query = $state("");
    let highlight = $state(0);

    // Svelte action for a lucide icon via Obsidian's setIcon.
    function icon(node: HTMLElement, name: string) {
        node.textContent = "";
        setIcon(node, name);
        return {};
    }

    // --- Single mode ---------------------------------------------------------
    let trimmedQuery = $derived(query.trim());
    let filtered = $derived(choices.filter((c) => c.toLowerCase().includes(trimmedQuery.toLowerCase())));
    let exactMatch = $derived(choices.some((c) => c.toLowerCase() === trimmedQuery.toLowerCase()));
    let singleItems = $derived(buildSingleItems(filtered, trimmedQuery, exactMatch));
    $effect(() => {
        const maxHighlight = Math.max(0, singleItems.length - 1);
        if (highlight > maxHighlight) highlight = maxHighlight;
    });

    function buildSingleItems(matches: string[], q: string, exact: boolean): SingleItem[] {
        const items: SingleItem[] = matches.map((c) => ({kind: "choice", value: c, label: c}));
        if (q !== "" && !exact) {
            items.push({kind: "use", value: q, label: `Use "${q}"`});
            items.push({kind: "save", value: q, label: `Save "${q}" as a choice`});
        }
        return items;
    }

    async function persistChoices(values: string[]) {
        try {
            await onSaveChoices(values);
        } catch (e) {
            // The chosen value is still valid; persistence is best-effort.
            console.error("MetaEdit: failed to save new auto property choice", e);
        }
    }

    async function chooseSingle(item: SingleItem) {
        if (!item) return;
        if (item.kind === "save") {
            await persistChoices([item.value]);
        }
        onSubmit(item.value);
    }

    function onSingleKeydown(e: KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            highlight = Math.min(highlight + 1, singleItems.length - 1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            highlight = Math.max(highlight - 1, 0);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (singleItems.length > 0) chooseSingle(singleItems[highlight]);
            else if (trimmedQuery !== "") onSubmit(trimmedQuery);
        }
    }

    // --- Multi mode ----------------------------------------------------------
    let options = $state<string[]>(untrack(() => initialIsMulti ? multiSelectOptions(initialAutoProperty, initialCurrentValue) : []));
    let checkedValues = $state<string[]>(untrack(() => toValueArray(initialCurrentValue)));
    let saveNew = $state(false);

    let newCheckedValues = $derived(options.filter((o) => checkedValues.includes(o) && !choices.includes(o)));

    function toggleCheck(value: string) {
        checkedValues = checkedValues.includes(value)
            ? checkedValues.filter((checkedValue) => checkedValue !== value)
            : [...checkedValues, value];
    }

    function addMultiValue() {
        const value = query.trim();
        if (value === "") return;
        if (!options.includes(value)) options = [...options, value];
        if (!checkedValues.includes(value)) checkedValues = [...checkedValues, value];
        query = "";
    }

    function onMultiAddKeydown(e: KeyboardEvent) {
        if (e.key === "Enter") {
            e.preventDefault();
            addMultiValue();
        }
    }

    async function confirmMulti() {
        const result = options.filter((o) => checkedValues.includes(o));
        if (saveNew && newCheckedValues.length > 0) {
            await persistChoices(newCheckedValues);
        }
        onSubmit(result);
    }

    let didFocus = false;
    $effect(() => {
        const el = inputEl;
        if (!el || didFocus) return;
        didFocus = true;
        el.focus();
    });
</script>

<div class="metaedit-ap-prompt">
    <div class="metaedit-ap-prompt-head">
        <div class="metaedit-ap-prompt-title">{initialAutoProperty.name}</div>
        {#if initialAutoProperty.description}
            <div class="metaedit-ap-prompt-desc">{initialAutoProperty.description}</div>
        {/if}
    </div>

    {#if initialIsMulti}
        <input
            bind:this={inputEl}
            class="metaedit-ap-prompt-input"
            type="text"
            placeholder="Type a value and press Enter to add it"
            bind:value={query}
            onkeydown={onMultiAddKeydown}
        />
        <div class="metaedit-ap-prompt-list" role="listbox" aria-multiselectable="true">
            {#each options as option (option)}
                <label class="metaedit-ap-prompt-row metaedit-ap-prompt-check">
                    <input type="checkbox" checked={checkedValues.includes(option)} onchange={() => toggleCheck(option)} />
                    <span class="metaedit-ap-prompt-row-label">{option}</span>
                    {#if !choices.includes(option)}
                        <span class="metaedit-ap-prompt-tag">new</span>
                    {/if}
                </label>
            {:else}
                <div class="metaedit-ap-prompt-empty">No values yet - type one above and press Enter.</div>
            {/each}
        </div>
        {#if newCheckedValues.length > 0}
            <label class="metaedit-ap-prompt-savenew">
                <input type="checkbox" bind:checked={saveNew} />
                Also add new values to this property's choice list
            </label>
        {/if}
        <div class="metaedit-ap-prompt-actions">
            <button class="mod-cta" onclick={confirmMulti}>Confirm</button>
        </div>
    {:else}
        <input
            bind:this={inputEl}
            class="metaedit-ap-prompt-input"
            type="text"
            placeholder="Pick a value, or type a new one"
            bind:value={query}
            onkeydown={onSingleKeydown}
        />
        <div class="metaedit-ap-prompt-list" role="listbox">
            {#each singleItems as item, i (item.kind + item.value)}
                <button
                    class="metaedit-ap-prompt-row"
                    class:is-selected={i === highlight}
                    class:metaedit-ap-prompt-action={item.kind !== "choice"}
                    onclick={() => chooseSingle(item)}
                    onmouseenter={() => (highlight = i)}
                >
                    {#if item.kind === "save"}
                        <span class="metaedit-ap-prompt-row-icon" use:icon={"plus"}></span>
                    {:else if item.kind === "use"}
                        <span class="metaedit-ap-prompt-row-icon" use:icon={"corner-down-left"}></span>
                    {/if}
                    <span class="metaedit-ap-prompt-row-label">{item.label}</span>
                </button>
            {:else}
                <div class="metaedit-ap-prompt-empty">No choices defined - type a value and press Enter.</div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .metaedit-ap-prompt {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }

    .metaedit-ap-prompt-head {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
    }

    .metaedit-ap-prompt-title {
        font-size: var(--font-ui-large, 1.1em);
        font-weight: var(--font-semibold, 600);
        color: var(--text-normal);
    }

    .metaedit-ap-prompt-desc {
        color: var(--text-muted);
        font-size: var(--font-ui-small, 0.85em);
        line-height: 1.4;
    }

    .metaedit-ap-prompt-input {
        width: 100%;
    }

    .metaedit-ap-prompt-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-height: 16rem;
        overflow-y: auto;
    }

    .metaedit-ap-prompt-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        text-align: left;
        padding: 0.4rem 0.55rem;
        border-radius: var(--radius-s, 4px);
        background: transparent;
        box-shadow: none;
        color: var(--text-normal);
        cursor: pointer;
        font-size: var(--font-ui-medium, 1em);
    }

    .metaedit-ap-prompt-row.is-selected {
        background-color: var(--background-modifier-hover);
    }

    .metaedit-ap-prompt-action {
        color: var(--text-muted);
    }

    .metaedit-ap-prompt-check {
        cursor: pointer;
    }

    .metaedit-ap-prompt-check input {
        margin: 0;
    }

    .metaedit-ap-prompt-row-icon {
        display: inline-flex;
        align-items: center;
    }

    .metaedit-ap-prompt-row-label {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .metaedit-ap-prompt-tag {
        flex: 0 0 auto;
        font-size: var(--font-ui-smaller, 0.75em);
        color: var(--text-accent);
        border: 1px solid var(--background-modifier-border);
        border-radius: var(--radius-s, 4px);
        padding: 0 0.3rem;
    }

    .metaedit-ap-prompt-empty {
        color: var(--text-muted);
        padding: 0.4rem 0.55rem;
        font-size: var(--font-ui-small, 0.85em);
    }

    .metaedit-ap-prompt-savenew {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        color: var(--text-muted);
        font-size: var(--font-ui-small, 0.85em);
        cursor: pointer;
    }

    .metaedit-ap-prompt-actions {
        display: flex;
        justify-content: flex-end;
    }
</style>
