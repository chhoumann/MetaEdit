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

        save(autoProperties);
    }

    function removeProperty(property: AutoProperty) {
        autoProperties = autoProperties.filter(ac => ac !== property);
        save(autoProperties);
    }

    function removeChoice(property: AutoProperty, i: number) {
        property.choices.splice(i, 1);
        autoProperties = autoProperties; // Svelte
        save(autoProperties);
    }

    function addChoice(property: AutoProperty) {
        autoProperties = autoProperties.map(prop => {
            if (prop === property) {
                prop.choices.push("");
            }
            return prop;
        })
        save(autoProperties);
    }
</script>

<div class="centerSettingContent">
    <table>
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
                    <input on:change={() => save(autoProperties)} type="text" placeholder="Property name" bind:value={property.name}>
                </td>
                <td>
                    {#each property.choices as choice, i}
                        <div style="display: block">
                            <input on:change={() => save(autoProperties)} type="text" bind:value={choice} />
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