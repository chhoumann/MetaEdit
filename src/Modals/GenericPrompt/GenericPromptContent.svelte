<script lang="ts">
    import {onDestroy, onMount} from "svelte";
    import {GenericTextSuggester} from "./genericTextSuggester";
    import {consumePendingValueContext} from "./promptValueContext";
    import {getDateInputType, getValueSuggestions} from "./valueSuggest";
    import type {App} from "obsidian";

    export let app: App;
    export let header: string = "";
    export let placeholder: string = "";
    export let value: string = "";
    export let onSubmit: (value: string) => void;
    export let suggestValues: string[];
    let suggester: GenericTextSuggester;
    let inputEl: HTMLInputElement;

    // Context for the property being edited (set by metaEditSuggester). Taken once
    // so a stale context never leaks into a later prompt.
    const context = consumePendingValueContext();
    const hasExplicitSuggestions = Array.isArray(suggestValues) && suggestValues.length > 0;

    // Date detection is cheap (property-type registry lookups), so resolve it up
    // front to pick the input type before first paint. Explicit suggestion lists
    // (Auto Properties) keep their plain choice-list behaviour and never become a
    // date picker.
    const dateInputType = !hasExplicitSuggestions && context
        ? getDateInputType(context.app, context.key, value, context.type)
        : null;

    onMount(() => {
        if (!dateInputType) {
            const suggestions = hasExplicitSuggestions
                ? suggestValues
                : context
                    ? getValueSuggestions(context.app, context.key, context.type)
                    : [];

            if (suggestions.length > 0)
                suggester = new GenericTextSuggester(app, inputEl, suggestions);
        }

        inputEl.focus();
        if (!dateInputType) inputEl.select();
    })

    // The suggester's dropdown lives in appContainerEl (outside the modal), so it
    // must be torn down explicitly when the prompt closes or it lingers.
    onDestroy(() => suggester?.close())

    function submit(evt: KeyboardEvent) {
        if (evt.key === "Enter") {
            evt.preventDefault();
            onSubmit(value);
        }
    }
</script>

<div class="metaEditPrompt">
    <h1 style="text-align: center">{header}</h1>
    {#if dateInputType === "date"}
        <input bind:this={inputEl}
               bind:value={value}
               class="metaEditPromptInput metadata-input metadata-input-text mod-date"
               on:keydown={submit}
               style="width: 100%;"
               type="date">
    {:else if dateInputType === "datetime"}
        <input bind:this={inputEl}
               bind:value={value}
               class="metaEditPromptInput metadata-input metadata-input-text mod-datetime"
               on:keydown={submit}
               style="width: 100%;"
               type="datetime-local">
    {:else}
        <input bind:this={inputEl}
               bind:value={value}
               class="metaEditPromptInput"
               on:keydown={submit}
               placeholder={placeholder}
               style="width: 100%;"
               type="text">
    {/if}
</div>
