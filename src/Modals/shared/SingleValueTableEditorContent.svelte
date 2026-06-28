<script lang="ts">
    import {untrack} from "svelte";

    let {
        save,
        properties: initialProperties = [],
    }: {
        save: (properties: string[]) => void;
        properties?: string[];
    } = $props();

    let properties = $state(untrack(() => [...initialProperties]));
    let propertyIndexes = $derived(properties.map((_, i) => i));

    function saveProperties() {
        save($state.snapshot(properties));
    }

    function addNewProperty() {
        properties = [...properties, ""];
        saveProperties();
    }

    function removeProperty(i: number) {
        properties = properties.filter((_, index) => index !== i);
        saveProperties();
    }
</script>

<div class="centerSettingContent">
    <table style="width: 100%">
        <thead>
        <tr>
            <th></th>
            <th>Property</th>
        </tr>
        </thead>
        <tbody>
            {#each propertyIndexes as i (i)}
                <tr>
                    <td>
                        <input type="button" value="❌" class="not-a-button" onclick={() => removeProperty(i)}/>
                    </td>
                    <td>
                        <input onchange={saveProperties} style="width: 100%;" type="text" placeholder="Property name" bind:value={properties[i]}>
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

    button {
        margin-left: 5px;
        margin-right: 5px;
        font-size: 15px;
    }
</style>
