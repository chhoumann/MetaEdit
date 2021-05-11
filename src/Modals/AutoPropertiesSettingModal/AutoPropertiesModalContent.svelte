<script lang="ts">
    import type {AutoProperty} from "../../Types/autoProperty";

    export let save: (autoProperties: AutoProperty[]) => void;
    export let autoProperties: AutoProperty[] = [];

    function addNewProperty() {
        let newProp: AutoProperty = {name: "", choices: [""]};

        if (typeof autoProperties[Symbol.iterator] !== 'function')
            autoProperties = [newProp];
        else
            autoProperties = [...autoProperties, newProp];
    }

    function removeProperty(property: AutoProperty) {
        autoProperties = autoProperties.filter(ac => ac !== property);
    }

    function removeChoice(property: AutoProperty, i: number) {
        property.choices.splice(i, 1);
        autoProperties = autoProperties; // Svelte
    }

    function addChoice(property: AutoProperty) {
        autoProperties = autoProperties.map(prop => {
            if (prop === property) {
                prop.choices.push("");
            }
            return prop;
        })
    }
</script>

<div>
    <h1>Auto Properties settings</h1>
    <table style="width: 100%">
        <thead>
        <tr>
            <th></th>
            <th>Name</th>
            <th>Values</th>
        </tr>
        </thead>
        {#each autoProperties as property}
            <tr>
                <td>
                    <input type="button" value="❌" class="not-a-button" on:click={() => removeProperty(property)}/>
                </td>
                <td>
                    <input type="text" placeholder="Property name" bind:value={property.name}>
                </td>
                <td>
                    {#each property.choices as choice, i}
                        <div style="display: block">
                            <input type="text" bind:value={choice} />
                            <input class="not-a-button" type="button" value="❌" on:click={() => removeChoice(property, i)}>
                        </div>
                    {/each}
                </td>
                <td>
                    <div style="width: 50%; text-align: center; margin: 5px auto auto;">
                        <input class="not-a-button" type="button" value="➕" on:click={() => addChoice(property)}>
                    </div>
                </td>
            </tr>
            <br>
        {/each}
    </table>

    <div class="buttonContainer">
        <button on:click={addNewProperty} class="mod-cta">Add</button>
        <button on:click={() => save(autoProperties)} class="mod-cta">Save</button>
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