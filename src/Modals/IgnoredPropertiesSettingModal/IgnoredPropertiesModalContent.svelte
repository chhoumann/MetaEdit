<script lang="ts">
    export let save: (ignoredProperties: string[]) => void;
    export let ignoredProperties: string[] = [];

    function addNewProperty() {
        ignoredProperties.push("");
        ignoredProperties = ignoredProperties; // Svelte
    }

    function removeProperty(i: number) {
        ignoredProperties.splice(i, 1);
        ignoredProperties = ignoredProperties; // Svelte
    }
</script>

<div>
    <h1>Ignored Properties settings</h1>
    <table style="width: 100%">
        <thead>
        <tr>
            <th></th>
            <th>Name</th>
        </tr>
        </thead>
        {#each ignoredProperties as property, i}
            <tr>
                <td>
                    <input type="button" value="❌" class="not-a-button" on:click={() => removeProperty(i)}/>
                </td>
                <td>
                    <input style="width: 100%;" type="text" placeholder="Property name" bind:value={property}>
                </td>
            </tr>
        {/each}
    </table>

    <div class="buttonContainer">
        <button on:click={addNewProperty} class="mod-cta">Add</button>
        <button on:click={() => save(ignoredProperties)} class="mod-cta">Save</button>
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

    .not-a-button {
        background: none;
        color: inherit;
        border: none;
        padding: 0;
        font: inherit;
        cursor: pointer;
        outline: inherit;
    }
</style>