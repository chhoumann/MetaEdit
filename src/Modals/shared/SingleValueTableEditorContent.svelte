<script lang="ts">
    export let save: (properties: string[]) => void;
    export let properties: string[] = [];

    function addNewProperty() {
        properties.push("");
        properties = properties; // Svelte
        save(properties);
    }

    function removeProperty(i: number) {
        properties.splice(i, 1);
        properties = properties; // Svelte
        save(properties);
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
        {#each properties as property, i}
            <tr>
                <td>
                    <input type="button" value="❌" class="not-a-button" on:click={() => removeProperty(i)}/>
                </td>
                <td>
                    <input on:change={async () => save(properties)} style="width: 100%;" type="text" placeholder="Property name" bind:value={property}>
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