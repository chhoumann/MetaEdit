<script lang="ts">
    import {KanbanProperty} from "../../Types/kanbanProperty";
    import {KanbanHelperSettingSuggester} from "./KanbanHelperSettingSuggester";
    import type {App, TFile} from "obsidian";
    import {onMount} from "svelte";

    export let save: (kanbanProperties: KanbanProperty[]) => void;
    export let kanbanProperties: KanbanProperty[] = [];
    export let boards: TFile[];
    export let app: App;
    let suggestEl: HTMLInputElement;
    let suggester: KanbanHelperSettingSuggester;
    let inputValue: string;

    onMount(() => {
        suggester = new KanbanHelperSettingSuggester(app, suggestEl, boards);
    })

    function addNewProperty() {
        const board: TFile = boards.find(board => board.basename === inputValue);
        const exists: boolean = !!kanbanProperties.find(kp => kp.boardName === board.basename);
        if (!board || exists) return;

        kanbanProperties.push({
            property: "",
            boardName: board.basename
        });

        kanbanProperties = kanbanProperties; // Svelte
        save(kanbanProperties);
    }

    function removeProperty(i: number) {
        kanbanProperties.splice(i, 1);
        kanbanProperties = kanbanProperties; // Svelte
        save(kanbanProperties);
    }

    function getHeadingsInBoard(boardName: string): string {
        const file = boards.find(board => board.basename === boardName)
        const headings = app.metadataCache.getFileCache(file).headings;
        if (!headings) return "";
        return headings.map(heading => heading.heading).join(", ");
    }
</script>

<div class="centerSettingContent">
    <table style="width: 100%">
        <thead>
        <tr>
            <th></th>
            <th>Board</th>
            <th>Property in link</th>
            <th>Possible values</th>
        </tr>
        </thead>
        {#each kanbanProperties as kanbanProperty, i}
            <tr>
                <td>
                    <input type="button" value="❌" class="not-a-button" on:click={() => removeProperty(i)}/>
                </td>
                <td>
                    {kanbanProperty.boardName}
                </td>
                <td>
                    <input on:change={() => save(kanbanProperties)} type="text" placeholder="Property name" bind:value={kanbanProperty.property}>
                </td>
                <td>
                        {getHeadingsInBoard(kanbanProperty.boardName)}
                </td>
            </tr>
            <br>
        {/each}
    </table>

    <input bind:this={suggestEl} bind:value={inputValue} type="text">
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