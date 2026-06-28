<script lang="ts">
    import {untrack} from "svelte";
    import {GenericTextSuggester} from "./genericTextSuggester";
    import {consumePendingValueContext} from "./promptValueContext";
    import {getDateInputType, getValueSuggestions} from "./valueSuggest";
    import type {App} from "obsidian";

    let {
        app,
        header = "",
        placeholder = "",
        value: propValue = "",
        onSubmit,
        suggestValues = [],
    }: {
        app: App;
        header?: string;
        placeholder?: string;
        value?: string;
        onSubmit: (value: string) => void;
        suggestValues?: string[];
    } = $props();

    const initialApp = untrack(() => app);
    const initialSuggestValues = untrack(() => suggestValues);
    const initialValue = untrack(() => propValue);
    let value = $state(initialValue);
    let suggester: GenericTextSuggester | undefined;
    let inputEl = $state<HTMLInputElement>();

    // The property being edited (set by metaEditSuggester). Taken once so a stale
    // context never leaks into a later prompt.
    const context = consumePendingValueContext();
    const hasExplicitSuggestions = Array.isArray(initialSuggestValues) && initialSuggestValues.length > 0;

    // Date detection is cheap (property-type registry lookups), so resolve it up
    // front to pick the input type before first paint. Explicit suggestion lists
    // (Auto Properties) keep their plain choice-list behaviour and never become a
    // date picker.
    const dateInputType = !hasExplicitSuggestions && context
        ? getDateInputType(context.app, context.key, initialValue, context.type)
        : null;
    // datetime-local needs step="1" to show/keep seconds; without it a seconds
    // value would be silently truncated.
    const datetimeStep = dateInputType === "datetime" && /T\d{2}:\d{2}:\d{2}/.test(initialValue) ? "1" : undefined;

    let didInitialise = false;
    $effect(() => {
        const el = inputEl;
        if (!el || didInitialise) return;
        didInitialise = true;

        let suggestions: string[] = [];
        if (!dateInputType) {
            suggestions = hasExplicitSuggestions
                ? initialSuggestValues
                : context
                    ? getValueSuggestions(context.app, context.key, context.type)
                    : [];
        }

        el.focus();
        if (!dateInputType) el.select();

        if (!dateInputType && suggestions.length > 0) {
            // The native suggester binds to focus/input in its constructor. Create
            // it after the programmatic focus so a seeded prompt stays quiet and
            // bare Enter submits the current value instead of picking the first
            // suggestion. Empty prompts still open below for discovery.
            suggester = new GenericTextSuggester(initialApp, el, suggestions);
        }

        // Empty-seeded prompts (Auto Property choices, name discovery) should show
        // their options immediately; the programmatic focus above does not reliably
        // fire a focus event, so open the dropdown explicitly.
        if (suggester && !initialValue) suggester.refreshSuggestions();

        // The suggester's dropdown lives in appContainerEl (outside the modal), so
        // it must be torn down explicitly when the prompt closes or it lingers.
        return () => {
            suggester?.close();
            suggester = undefined;
        };
    });

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
               onkeydown={submit}
               style="width: 100%;"
               type="date">
    {:else if dateInputType === "datetime"}
        <input bind:this={inputEl}
               bind:value={value}
               class="metaEditPromptInput metadata-input metadata-input-text mod-datetime"
               onkeydown={submit}
               step={datetimeStep}
               style="width: 100%;"
               type="datetime-local">
    {:else}
        <input bind:this={inputEl}
               bind:value={value}
               class="metaEditPromptInput"
               onkeydown={submit}
               placeholder={placeholder}
               style="width: 100%;"
               type="text">
    {/if}
</div>
