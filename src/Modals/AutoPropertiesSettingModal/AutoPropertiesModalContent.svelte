<script lang="ts">
    import {untrack} from "svelte";
    import {setIcon} from "obsidian";
    import type {AutoProperty, AutoPropertyType} from "../../Types/autoProperty";
    import {splitPastedChoices, withChoicesPasted} from "../../autoProperties";

    let {
        save,
        autoProperties: initialAutoProperties = [],
    }: {
        save: (autoProperties: AutoProperty[]) => void;
        autoProperties?: AutoProperty[];
    } = $props();

    const types: AutoPropertyType[] = ["Single", "Multi"];
    let autoProperties = $state<AutoProperty[]>(untrack(() => cloneAutoProperties(initialAutoProperties)));

    // Svelte action: render a lucide icon into an element via Obsidian's setIcon.
    function icon(node: HTMLElement, name: string) {
        const render = (n: string) => {
            node.textContent = "";
            setIcon(node, n);
        };
        render(name);
        return {update: render};
    }

    function cloneAutoProperties(properties: AutoProperty[]): AutoProperty[] {
        if (!Array.isArray(properties)) return [];

        return properties.map(property => ({
            ...property,
            choices: Array.isArray(property.choices) ? [...property.choices] : [],
        }));
    }

    function indexes<T>(values: T[]): number[] {
        return values.map((_, i) => i);
    }

    function saveProperties() {
        save($state.snapshot(autoProperties) as AutoProperty[]);
    }

    function addNewProperty() {
        autoProperties = [...autoProperties, {name: "", choices: [""], type: "Single"}];
        saveProperties();
    }

    function removeProperty(property: AutoProperty) {
        autoProperties = autoProperties.filter(ac => ac !== property);
        saveProperties();
    }

    function removeChoice(property: AutoProperty, i: number) {
        property.choices = property.choices.filter((_, index) => index !== i);
        saveProperties();
    }

    function addChoice(property: AutoProperty) {
        property.choices = [...property.choices, ""];
        saveProperties();
    }

    // Paste a whole list (newline- or comma-separated) into a single value box and
    // have it become individual choices (issue #47). A paste that yields a single
    // token falls through to the browser's default, so pasting one value still works.
    function pasteChoices(property: AutoProperty, index: number, event: ClipboardEvent) {
        const tokens = splitPastedChoices(event.clipboardData?.getData("text") ?? "");
        if (tokens.length < 2) return;

        event.preventDefault();
        property.choices = withChoicesPasted(property.choices, index, tokens);
        saveProperties();
    }

    function setType(property: AutoProperty, value: string) {
        property.type = value as AutoPropertyType;
        saveProperties();
    }
</script>

<div class="metaedit-auto-properties">
    {#if autoProperties.length === 0}
        <p class="metaedit-empty">
            No auto properties yet. Add one to define a reusable set of values for a property.
        </p>
    {/if}

    {#each autoProperties as property (property)}
        <div class="metaedit-ap-card">
            <div class="metaedit-ap-header">
                <input
                    class="metaedit-ap-name"
                    type="text"
                    placeholder="Property name"
                    bind:value={property.name}
                    onchange={saveProperties}
                />
                <select
                    class="dropdown metaedit-ap-type"
                    onchange={(e) => setType(property, e.currentTarget.value)}
                    aria-label="How many values this property holds"
                >
                    {#each types as t (t)}
                        <option value={t} selected={(property.type ?? "Single") === t}>{t}</option>
                    {/each}
                </select>
                <button
                    class="clickable-icon metaedit-ap-icon"
                    aria-label="Remove this auto property"
                    onclick={() => removeProperty(property)}
                >
                    <span use:icon={"trash-2"}></span>
                </button>
            </div>

            <input
                class="metaedit-ap-description"
                type="text"
                placeholder="Description (shown when you pick a value) - optional"
                bind:value={property.description}
                onchange={saveProperties}
            />

            <div class="metaedit-ap-values">
                <span class="metaedit-ap-label">Values</span>
                {#each indexes(property.choices) as i (i)}
                    <div class="metaedit-ap-choice">
                        <input
                            type="text"
                            placeholder="Value (or paste a list)"
                            bind:value={property.choices[i]}
                            onchange={saveProperties}
                            onpaste={(e) => pasteChoices(property, i, e)}
                        />
                        <button
                            class="clickable-icon metaedit-ap-icon"
                            aria-label="Remove value"
                            onclick={() => removeChoice(property, i)}
                        >
                            <span use:icon={"x"}></span>
                        </button>
                    </div>
                {/each}
                <button class="metaedit-ap-add-value" onclick={() => addChoice(property)}>
                    <span use:icon={"plus"}></span>
                    Add value
                </button>
            </div>
        </div>
    {/each}

    <div class="metaedit-ap-footer">
        <button onclick={addNewProperty} class="mod-cta">Add auto property</button>
    </div>
</div>

<style>
    .metaedit-auto-properties {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-top: 0.5rem;
    }

    .metaedit-empty {
        color: var(--text-muted);
        text-align: center;
        margin: 0.5rem 0;
    }

    .metaedit-ap-card {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.75rem;
        border: 1px solid var(--background-modifier-border);
        border-radius: var(--radius-m, 8px);
        background-color: var(--background-secondary);
    }

    .metaedit-ap-header {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .metaedit-ap-name {
        flex: 1 1 auto;
        min-width: 0;
        font-weight: var(--font-semibold, 600);
    }

    .metaedit-ap-type {
        flex: 0 0 auto;
    }

    .metaedit-ap-description {
        width: 100%;
    }

    .metaedit-ap-values {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }

    .metaedit-ap-label {
        color: var(--text-muted);
        font-size: var(--font-ui-smaller, 0.8em);
    }

    .metaedit-ap-choice {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .metaedit-ap-choice input {
        flex: 1 1 auto;
        min-width: 0;
    }

    .metaedit-ap-icon {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }

    .metaedit-ap-add-value {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        align-self: flex-start;
        background: transparent;
        box-shadow: none;
        color: var(--text-muted);
        padding: 0.25rem 0.4rem;
        cursor: pointer;
    }

    .metaedit-ap-add-value:hover {
        color: var(--text-normal);
    }

    .metaedit-ap-footer {
        display: flex;
        justify-content: center;
        margin-top: 0.25rem;
    }
</style>
