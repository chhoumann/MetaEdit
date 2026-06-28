<script lang="ts">
    import {untrack} from "svelte";
    import {ProgressPropertyOptions} from "../../Types/progressPropertyOptions";
    import type {ProgressProperty} from "../../Types/progressProperty";

    const options: string[] = Object.keys(ProgressPropertyOptions)
        .map(k => ProgressPropertyOptions[k]);

    let {
        save,
        properties: initialProperties = [],
    }: {
        save: (properties: ProgressProperty[]) => void;
        properties?: ProgressProperty[];
    } = $props();

    let properties = $state<ProgressProperty[]>(untrack(() => initialProperties.map(property => ({...property}))));

    function saveProperties() {
        save($state.snapshot(properties) as ProgressProperty[]);
    }

    function addNewProperty() {
        const newProp: ProgressProperty = {name: "", type: ProgressPropertyOptions.TaskTotal}
        properties = [...properties, newProp];
        saveProperties();
    }

    function removeProperty(property: ProgressProperty) {
        properties = properties.filter(prop => prop !== property);
        saveProperties();
    }
</script>

<div class="centerSettingContent">
    <table style="width: 100%">
        <thead>
            <tr>
                <th>Name</th>
                <th>Type</th>
            </tr>
        </thead>
        <tbody>
            {#each properties as property (property)}
                <tr>
                    <td>
                        <input type="text" placeholder="Property name" bind:value={property.name} onchange={saveProperties}>
                    </td>
                    <td>
                        <select bind:value={property.type} onchange={saveProperties}>
                            {#each options as text (text)}
                            <option value={text} label={text}></option>
                            {/each}
                        </select>
                    </td>
                    <td>
                        <input type="button" class="not-a-button" onclick={() => removeProperty(property)} value="❌"/>
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>

    <div class="buttonContainer">
        <button onclick={addNewProperty} class="mod-cta">Add</button>
    </div>
</div>

<style>
    .buttonContainer {
        display: flex;
        justify-content: center;
        margin-top: 1rem;
    }

    select {
        border-radius: 4px;
        width: 100%;
        height: 30px;
        border: 1px solid #dbdbdc;
        color: #383a42;
        background-color: #fff;
        padding: 3px;
    }

    button {
        margin-left: 5px;
        margin-right: 5px;
        font-size: 15px;
    }
</style>
