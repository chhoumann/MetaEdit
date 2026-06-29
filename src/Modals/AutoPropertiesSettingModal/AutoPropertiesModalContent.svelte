<script lang="ts">
    import {untrack} from "svelte";
    import {setIcon} from "obsidian";
    import type {AutoProperty, AutoPropertyType} from "../../Types/autoProperty";
    import {
        cloneAutoProperty,
        cloneAutoProperties,
        splitPastedChoices,
        withChoicesPasted,
        type AutoPropertyOperationTarget,
        type AutoPropertySettingsOperation,
    } from "../../autoProperties";

    interface EditableAutoProperty {
        id: number;
        property: AutoProperty;
        targetName: string;
        choiceTargets: string[];
    }

    let {
        save,
        autoProperties: initialAutoProperties = [],
    }: {
        save: (operation: AutoPropertySettingsOperation) => void | Promise<void>;
        autoProperties?: AutoProperty[];
    } = $props();

    const types: AutoPropertyType[] = ["Single", "Multi"];
    let nextPropertyId = 0;
    let autoProperties = $state<EditableAutoProperty[]>(
        untrack(() => createEditableAutoProperties(initialAutoProperties)),
    );

    // Svelte action: render a lucide icon into an element via Obsidian's setIcon.
    function icon(node: HTMLElement, name: string) {
        const render = (n: string) => {
            node.textContent = "";
            setIcon(node, n);
        };
        render(name);
        return {update: render};
    }

    function indexes<T>(values: T[]): number[] {
        return values.map((_, i) => i);
    }

    function createEditableAutoProperties(properties: AutoProperty[]): EditableAutoProperty[] {
        return cloneAutoProperties(properties).map(property => createEditableAutoProperty(property));
    }

    function createEditableAutoProperty(property: AutoProperty): EditableAutoProperty {
        return {
            id: nextPropertyId++,
            property,
            targetName: property.name,
            choiceTargets: [...property.choices],
        };
    }

    function targetFor(entry: EditableAutoProperty, index: number): AutoPropertyOperationTarget {
        return {name: entry.targetName, index};
    }

    function persist(operation: AutoPropertySettingsOperation) {
        void Promise.resolve(save(operation)).catch(error => {
            console.error("MetaEdit could not save Auto Properties settings.", error);
        });
    }

    function addNewProperty() {
        const property: AutoProperty = {name: "", choices: [""], type: "Single"};
        const entry = createEditableAutoProperty(cloneAutoProperty(property));
        const index = autoProperties.length;
        autoProperties = [...autoProperties, entry];
        persist({kind: "addProperty", index, property});
    }

    function removeProperty(entry: EditableAutoProperty, index: number) {
        const target = targetFor(entry, index);
        autoProperties = autoProperties.filter(candidate => candidate !== entry);
        persist({kind: "removeProperty", target});
    }

    function removeChoice(entry: EditableAutoProperty, propertyIndex: number, choiceIndex: number) {
        const value = entry.choiceTargets[choiceIndex] ?? entry.property.choices[choiceIndex] ?? "";
        entry.property.choices = entry.property.choices.filter((_, index) => index !== choiceIndex);
        entry.choiceTargets = entry.choiceTargets.filter((_, index) => index !== choiceIndex);
        persist({kind: "removeChoice", target: targetFor(entry, propertyIndex), index: choiceIndex, value});
    }

    function addChoice(entry: EditableAutoProperty, propertyIndex: number) {
        const index = entry.property.choices.length;
        entry.property.choices = [...entry.property.choices, ""];
        entry.choiceTargets = [...entry.choiceTargets, ""];
        persist({kind: "addChoice", target: targetFor(entry, propertyIndex), index, value: ""});
    }

    // Paste a whole list (newline- or comma-separated) into a single value box and
    // have it become individual choices (issue #47). A paste that yields a single
    // token falls through to the browser's default, so pasting one value still works.
    function pasteChoices(entry: EditableAutoProperty, propertyIndex: number, index: number, event: ClipboardEvent) {
        const tokens = splitPastedChoices(event.clipboardData?.getData("text") ?? "");
        if (tokens.length < 2) return;

        event.preventDefault();
        const previousValue = entry.choiceTargets[index] ?? entry.property.choices[index] ?? "";
        entry.property.choices = withChoicesPasted(entry.property.choices, index, tokens);
        entry.choiceTargets = withChoicesPasted(entry.choiceTargets, index, tokens);
        persist({
            kind: "replaceChoiceWithChoices",
            target: targetFor(entry, propertyIndex),
            index,
            previousValue,
            values: tokens,
        });
    }

    function setName(entry: EditableAutoProperty, index: number, value: string) {
        const target = targetFor(entry, index);
        entry.property.name = value;
        entry.targetName = value;
        persist({kind: "setName", target, value});
    }

    function setDescription(entry: EditableAutoProperty, index: number, value: string) {
        entry.property.description = value;
        persist({kind: "setDescription", target: targetFor(entry, index), value});
    }

    function setType(entry: EditableAutoProperty, index: number, value: string) {
        const type = value as AutoPropertyType;
        entry.property.type = type;
        persist({kind: "setType", target: targetFor(entry, index), value: type});
    }

    function setChoice(entry: EditableAutoProperty, propertyIndex: number, choiceIndex: number, value: string) {
        const previousValue = entry.choiceTargets[choiceIndex] ?? entry.property.choices[choiceIndex] ?? "";
        entry.property.choices[choiceIndex] = value;
        entry.choiceTargets[choiceIndex] = value;
        persist({
            kind: "setChoice",
            target: targetFor(entry, propertyIndex),
            index: choiceIndex,
            previousValue,
            value,
        });
    }
</script>

<div class="metaedit-auto-properties">
    {#if autoProperties.length === 0}
        <p class="metaedit-empty">
            No auto properties yet. Add one to define a reusable set of values for a property.
        </p>
    {/if}

    {#each autoProperties as entry, propertyIndex (entry.id)}
        {@const property = entry.property}
        <div class="metaedit-ap-card">
            <div class="metaedit-ap-header">
                <input
                    class="metaedit-ap-name"
                    type="text"
                    placeholder="Property name"
                    value={property.name}
                    oninput={(e) => property.name = e.currentTarget.value}
                    onchange={(e) => setName(entry, propertyIndex, e.currentTarget.value)}
                />
                <select
                    class="dropdown metaedit-ap-type"
                    onchange={(e) => setType(entry, propertyIndex, e.currentTarget.value)}
                    aria-label="How many values this property holds"
                >
                    {#each types as t (t)}
                        <option value={t} selected={(property.type ?? "Single") === t}>{t}</option>
                    {/each}
                </select>
                <button
                    class="clickable-icon metaedit-ap-icon"
                    aria-label="Remove this auto property"
                    onclick={() => removeProperty(entry, propertyIndex)}
                >
                    <span use:icon={"trash-2"}></span>
                </button>
            </div>

            <input
                class="metaedit-ap-description"
                type="text"
                placeholder="Description (shown when you pick a value) - optional"
                value={property.description ?? ""}
                oninput={(e) => property.description = e.currentTarget.value}
                onchange={(e) => setDescription(entry, propertyIndex, e.currentTarget.value)}
            />

            <div class="metaedit-ap-values">
                <span class="metaedit-ap-label">Values</span>
                {#each indexes(property.choices) as i (i)}
                    <div class="metaedit-ap-choice">
                        <input
                            type="text"
                            placeholder="Value (or paste a list)"
                            value={property.choices[i]}
                            oninput={(e) => property.choices[i] = e.currentTarget.value}
                            onchange={(e) => setChoice(entry, propertyIndex, i, e.currentTarget.value)}
                            onpaste={(e) => pasteChoices(entry, propertyIndex, i, e)}
                        />
                        <button
                            class="clickable-icon metaedit-ap-icon"
                            aria-label="Remove value"
                            onclick={() => removeChoice(entry, propertyIndex, i)}
                        >
                            <span use:icon={"x"}></span>
                        </button>
                    </div>
                {/each}
                <button class="metaedit-ap-add-value" onclick={() => addChoice(entry, propertyIndex)}>
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
