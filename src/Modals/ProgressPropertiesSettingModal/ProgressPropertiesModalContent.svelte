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
    }

    function removeProperty(property) {
        properties = properties.filter(prop => prop !== property);
    }
</script>

<div>
    <h1>Progress Properties settings</h1>
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
                    <input type="text" placeholder="Property name" bind:value={property.name}>
                </td>
                <td>
                    <select bind:value={property.type}>
                        {#each options as text}
                        <option value={text} label={text}></option>
                        {/each}
                    </select>
                </td>
                <td>
                    <p style="cursor:pointer;" on:click={() => removeProperty(property)}>❌</p>
                </td>
            </tr>
        {/each}
    </table>

    <div class="buttonContainer">
        <button on:click={addNewProperty} class="mod-cta">Add</button>
        <button on:click={() => save(properties)} class="mod-cta">Save</button>
    </div>
</div>

<style>
    .buttonContainer {
        display: flex;
        justify-content: space-between;
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