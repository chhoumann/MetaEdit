<script lang="ts">
    import {ProgressPropertyOptions} from "../../Types/progressPropertyOptions";
    import type {ProgressProperty} from "../../Types/progressProperty";

    const options: string[] = Object.keys(ProgressPropertyOptions)
        .map(k => ProgressPropertyOptions[k]);

    export let save: (properties: ProgressProperty[]) => void;
    export let properties: ProgressProperty[];

    function addNewProperty() {
        let newProp: ProgressProperty = {name: "", type: ProgressPropertyOptions.TaskTotal}
        properties = [...properties, newProp];
        save(properties);
    }

    function removeProperty(property) {
        properties = properties.filter(prop => prop !== property);
        save(properties);
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
        {#each properties as property}
            <tr>
                <td>
                    <input type="text" placeholder="Property name" bind:value={property.name} on:change={() => save(properties)}>
                </td>
                <td>
                    <select bind:value={property.type} on:change={() => save(properties)}>
                        {#each options as text}
                        <option value={text} label={text}></option>
                        {/each}
                    </select>
                </td>
                <td>
                    <input type="button" class="not-a-button" on:click={() => removeProperty(property)} value="❌"/>
                </td>
            </tr>
        {/each}
    </table>

    <div class="buttonContainer">
        <button on:click={addNewProperty} class="mod-cta">Add</button>
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