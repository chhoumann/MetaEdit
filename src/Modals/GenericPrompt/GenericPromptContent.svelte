<script lang="ts">
    import {onMount} from "svelte";
    import {GenericTextSuggester} from "./genericTextSuggester";
    import type {App} from "obsidian";

    export let app: App;
    export let header: string = "";
    export let placeholder: string = "";
    export let value: string = "";
    export let onSubmit: (value: string) => void;
    export let suggestValues: string[];
    let suggester: GenericTextSuggester;
    let inputEl: HTMLInputElement;

    onMount(() => {
        if (suggestValues.length > 0)
            suggester = new GenericTextSuggester(app, inputEl, suggestValues);

        inputEl.select();
        inputEl.focus();
    })

    function submit(evt: KeyboardEvent) {
        if (evt.key === "Enter") {
            evt.preventDefault();
            onSubmit(value);
        }
    }
</script>

<div class="metaEditPrompt">
    <h1 style="text-align: center">{header}</h1>
    <input bind:this={inputEl}
           bind:value={value}
           class="metaEditPromptInput"
           on:keydown={submit}
           placeholder={placeholder}
           style="width: 100%;"
           type="text">
</div>