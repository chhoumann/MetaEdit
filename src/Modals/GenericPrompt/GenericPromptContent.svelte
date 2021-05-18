<script lang="ts">
    import {onMount} from "svelte";

    export let header: string = "";
    export let placeholder: string = "";
    export let value: string = "";
    export let onSubmit: (value: string) => void;

    let inputEl: HTMLInputElement;
    onMount(() => {
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
    <input class="metaEditPromptInput" bind:this={inputEl} autofocus style="width: 100%;" on:keydown={submit} type="text" placeholder={placeholder} bind:value={value}>
</div>