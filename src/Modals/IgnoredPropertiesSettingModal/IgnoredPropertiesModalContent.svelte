<script lang="ts">
    import {untrack} from "svelte";

    let {
        save,
        ignoredProperties: initialIgnoredProperties = [],
    }: {
        save: (ignoredProperties: string[]) => void;
        ignoredProperties?: string[];
    } = $props();

    let ignoredProperties = $state(untrack(() => [...initialIgnoredProperties]));
    let ignoredPropertyIndexes = $derived(ignoredProperties.map((_, i) => i));

    function saveProperties() {
        save($state.snapshot(ignoredProperties));
    }

    function addNewProperty() {
        ignoredProperties = [...ignoredProperties, ""];
        saveProperties();
    }

    function removeProperty(i: number) {
        ignoredProperties = ignoredProperties.filter((_, index) => index !== i);
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
            {#each ignoredPropertyIndexes as i (i)}
                <tr>
                    <td>
                        <input type="button" value="❌" class="not-a-button" onclick={() => removeProperty(i)}/>
                    </td>
                    <td>
                        <input onchange={saveProperties} style="width: 100%;" type="text" placeholder="Property name" bind:value={ignoredProperties[i]}>
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
