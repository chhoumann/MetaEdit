<script lang="ts">
    import type {KanbanProperty} from "../../Types/kanbanProperty";
    import {KanbanHelperSettingSuggester} from "./KanbanHelperSettingSuggester";
    import type {App, TFile} from "obsidian";
    import {untrack} from "svelte";
    import {log} from "../../logger/logManager";

    let {
        save,
        kanbanProperties: initialKanbanProperties = [],
        boards,
        app,
    }: {
        save: (kanbanProperties: KanbanProperty[]) => void;
        kanbanProperties?: KanbanProperty[];
        boards: TFile[];
        app: App;
    } = $props();

    const initialApp = untrack(() => app);
    const initialBoards = untrack(() => boards);
    let kanbanProperties = $state<KanbanProperty[]>(untrack(() => initialKanbanProperties.map(property => ({...property}))));
    let suggestEl = $state<HTMLInputElement>();
    let suggester: KanbanHelperSettingSuggester | undefined;
    let inputValue = $state("");

    let didInitialise = false;
    $effect(() => {
        const el = suggestEl;
        if (!el || didInitialise) return;
        didInitialise = true;

        suggester = new KanbanHelperSettingSuggester(initialApp, el, initialBoards);
        return () => {
            suggester?.close();
            suggester = undefined;
        };
    });

    function saveProperties() {
        save($state.snapshot(kanbanProperties) as KanbanProperty[]);
    }

    function addNewProperty() {
        const board = initialBoards.find(board => board.basename === inputValue);
        if (!board) return;

        const exists: boolean = !!kanbanProperties.find(kp => kp.boardName === board.basename);
        if (exists) return;

        kanbanProperties = [...kanbanProperties, {
            property: "",
            boardName: board.basename
        }];

        saveProperties();
    }

    function removeProperty(i: number) {
        kanbanProperties = kanbanProperties.filter((_, index) => index !== i);
        saveProperties();
    }

    function getHeadingsInBoard(boardName: string): string {
        const file = initialBoards.find(board => board.basename === boardName)
        if (!file) {
            log.logWarning(`file ${boardName} not found.`);
            return "FILE NOT FOUND";
        }

        const headings = initialApp.metadataCache.getFileCache(file).headings;
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
        <tbody>
            {#each kanbanProperties as kanbanProperty, i (kanbanProperty.boardName)}
                <tr>
                    <td>
                        <input type="button" value="❌" class="not-a-button" onclick={() => removeProperty(i)}/>
                    </td>
                    <td>
                        {kanbanProperty.boardName}
                    </td>
                    <td>
                        <input onchange={saveProperties} type="text" placeholder="Property name" bind:value={kanbanProperty.property}>
                    </td>
                    <td>
                            {getHeadingsInBoard(kanbanProperty.boardName)}
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>

    <input bind:this={suggestEl} bind:value={inputValue} type="text">
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
