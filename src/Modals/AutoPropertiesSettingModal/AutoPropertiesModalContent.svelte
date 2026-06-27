<script lang="ts">
    import {setIcon} from "obsidian";
    import type {AutoProperty, AutoPropertyType} from "../../Types/autoProperty";

    export let save: (autoProperties: AutoProperty[]) => void;
    export let autoProperties: AutoProperty[] = [];

    const types: AutoPropertyType[] = ["Single", "Multi"];

    // Svelte action: render a lucide icon into an element via Obsidian's setIcon.
    function icon(node: HTMLElement, name: string) {
        const render = (n: string) => {
            node.textContent = "";
            setIcon(node, n);
        };
        render(name);
        return {update: render};
    }

    function asList(): AutoProperty[] {
        return Array.isArray(autoProperties) ? autoProperties : [];
    }

    function addNewProperty() {
        autoProperties = [...asList(), {name: "", choices: [""], type: "Single"}];
        save(autoProperties);
    }

    function removeProperty(property: AutoProperty) {
        autoProperties = asList().filter(ac => ac !== property);
        save(autoProperties);
    }

    function removeChoice(property: AutoProperty, i: number) {
        property.choices.splice(i, 1);
        autoProperties = autoProperties; // notify Svelte
        save(autoProperties);
    }

    function addChoice(property: AutoProperty) {
        property.choices = [...property.choices, ""];
        autoProperties = autoProperties; // notify Svelte
        save(autoProperties);
    }

    function setType(property: AutoProperty, value: string) {
        property.type = value as AutoPropertyType;
        save(autoProperties);
    }
</script>

<div class="metaedit-auto-properties">
    {#if asList().length === 0}
        <p class="metaedit-empty">
            No auto properties yet. Add one to define a reusable set of values for a property.
        </p>
    {/if}

    {#each asList() as property (property)}
        <div class="metaedit-ap-card">
            <div class="metaedit-ap-header">
                <input
                    class="metaedit-ap-name"
                    type="text"
                    placeholder="Property name"
                    bind:value={property.name}
                    on:change={() => save(autoProperties)}
                />
                <select
                    class="dropdown metaedit-ap-type"
                    on:change={(e) => setType(property, e.currentTarget.value)}
                    aria-label="How many values this property holds"
                >
                    {#each types as t}
                        <option value={t} selected={(property.type ?? "Single") === t}>{t}</option>
                    {/each}
                </select>
                <button
                    class="clickable-icon metaedit-ap-icon"
                    aria-label="Remove this auto property"
                    on:click={() => removeProperty(property)}
                >
                    <span use:icon={"trash-2"}></span>
                </button>
            </div>

            <input
                class="metaedit-ap-description"
                type="text"
                placeholder="Description (shown when you pick a value) - optional"
                bind:value={property.description}
                on:change={() => save(autoProperties)}
            />

            <div class="metaedit-ap-values">
                <span class="metaedit-ap-label">Values</span>
                {#each property.choices as choice, i}
                    <div class="metaedit-ap-choice">
                        <input
                            type="text"
                            placeholder="Value"
                            bind:value={choice}
                            on:change={() => save(autoProperties)}
                        />
                        <button
                            class="clickable-icon metaedit-ap-icon"
                            aria-label="Remove value"
                            on:click={() => removeChoice(property, i)}
                        >
                            <span use:icon={"x"}></span>
                        </button>
                    </div>
                {/each}
                <button class="metaedit-ap-add-value" on:click={() => addChoice(property)}>
                    <span use:icon={"plus"}></span>
                    Add value
                </button>
            </div>
        </div>
    {/each}

    <div class="metaedit-ap-footer">
        <button on:click={addNewProperty} class="mod-cta">Add auto property</button>
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
