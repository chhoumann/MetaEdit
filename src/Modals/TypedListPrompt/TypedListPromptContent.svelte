<script lang="ts">
	import {tick, untrack} from "svelte";
	import {setIcon, setTooltip} from "obsidian";
	import {
		appendTypedListItem,
		createAddedTypedListItem,
		displayTypedListValue,
		moveTypedListItem,
		prependTypedListItem,
		reconstructTypedList,
		type TypedListItem,
	} from "../../typedList";

	let {
		items: initialItems,
		propertyKey,
		onCancel,
		onSubmit,
	}: {
		items: TypedListItem[];
		propertyKey: string;
		onCancel: () => void;
		onSubmit: (value: unknown[]) => void;
	} = $props();

	const stableInitialItems = untrack(() => initialItems);
	const stablePropertyKey = untrack(() => propertyKey);

	let items = $state(stableInitialItems.map(item => ({...item})));
	let addValue = $state("");
	let addInputEl = $state<HTMLInputElement>();
	let nextId = stableInitialItems.length;
	const addInputId = `metaedit-typed-list-add-${stablePropertyKey.replace(/[^A-Za-z0-9_-]/g, "-")}`;

	function iconButton(node: HTMLElement, params: {icon: string; label: string}) {
		setIcon(node, params.icon);
		setTooltip(node, params.label);

		return {
			update(nextParams: {icon: string; label: string}) {
				setIcon(node, nextParams.icon);
				setTooltip(node, nextParams.label);
			},
		};
	}

	function updateItemText(id: string, text: string) {
		items = items.map(item => item.id === id ? {...item, text} : item);
	}

	function removeItem(id: string) {
		items = items.filter(item => item.id !== id);
	}

	async function focusAddInput() {
		await tick();
		addInputEl?.focus();
	}

	function consumeAddedItem(): TypedListItem | null {
		if (addValue.length === 0) return null;
		const item = createAddedTypedListItem(`item-${nextId++}`, addValue);
		addValue = "";
		return item;
	}

	function addItemToEnd() {
		const item = consumeAddedItem();
		if (!item) return;
		items = appendTypedListItem(items, item);
		void focusAddInput();
	}

	function addItemToBeginning() {
		const item = consumeAddedItem();
		if (!item) return;
		items = prependTypedListItem(items, item);
		void focusAddInput();
	}

	function removeLastItem() {
		if (items.length === 0) return;
		items = items.slice(0, -1);
	}

	function resetItem(item: TypedListItem) {
		if (item.kind === "added") {
			removeItem(item.id);
			return;
		}
		updateItemText(item.id, displayTypedListValue(item.originalValue));
	}

	function moveItem(index: number, direction: "down" | "up") {
		items = moveTypedListItem(items, index, direction);
	}

	function submit() {
		const submittedItems = addValue.length > 0
			? appendTypedListItem(items, createAddedTypedListItem(`item-${nextId}`, addValue))
			: items;
		onSubmit(reconstructTypedList(submittedItems));
	}

	function handleAddKeydown(event: KeyboardEvent) {
		if (event.key === "Enter") {
			event.preventDefault();
			if (addValue.length > 0) addItemToEnd();
			else submit();
			return;
		}

		if (event.key === "Backspace" && addValue === "") {
			event.preventDefault();
			removeLastItem();
			return;
		}

		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			onCancel();
		}
	}

	function handleItemKeydown(event: KeyboardEvent, item: TypedListItem) {
		if (event.key === "Enter") {
			event.preventDefault();
			void focusAddInput();
			return;
		}

		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			if (item.kind === "original" && item.text !== displayTypedListValue(item.originalValue)) {
				resetItem(item);
				void focusAddInput();
				return;
			}
			onCancel();
		}
	}
</script>

<div class="metaedit-typed-list-content">
	<h1 class="metaedit-typed-list-heading">Edit {stablePropertyKey}</h1>

	<label class="metaedit-typed-list-label" for={addInputId}>Values</label>
	<div class="multi-select-container metaedit-typed-list-editor" aria-label={`${stablePropertyKey} values`}>
		{#each items as item, index (item.id)}
			<span class="multi-select-pill metaedit-typed-list-pill">
				<button
					aria-label={`Move item ${index + 1} up`}
					class="clickable-icon metaedit-typed-list-move metaedit-typed-list-move-up"
					disabled={index === 0}
					onclick={() => moveItem(index, "up")}
					type="button"
					use:iconButton={{icon: "arrow-up", label: `Move item ${index + 1} up`}}></button>
				<button
					aria-label={`Move item ${index + 1} down`}
					class="clickable-icon metaedit-typed-list-move metaedit-typed-list-move-down"
					disabled={index === items.length - 1}
					onclick={() => moveItem(index, "down")}
					type="button"
					use:iconButton={{icon: "arrow-down", label: `Move item ${index + 1} down`}}></button>
				<input
					aria-label={`Edit item ${index + 1}`}
					class="metadata-input metadata-input-text metaedit-typed-list-pill-input"
					oninput={(event) => updateItemText(item.id, event.currentTarget.value)}
					onkeydown={(event) => handleItemKeydown(event, item)}
					type="text"
					value={item.text}>
				<button
					aria-label={`Remove item ${index + 1}`}
					class="clickable-icon metaedit-typed-list-remove"
					onclick={() => removeItem(item.id)}
					type="button"
					use:iconButton={{icon: "x", label: `Remove item ${index + 1}`}}></button>
			</span>
		{/each}
		<input
			bind:this={addInputEl}
			bind:value={addValue}
			class="multi-select-input metadata-input metadata-input-text metaedit-typed-list-add-input"
			id={addInputId}
			onkeydown={handleAddKeydown}
			placeholder="Add value"
			type="text">
	</div>

	<div class="metaedit-typed-list-actions">
		<button class="metaedit-typed-list-add-beginning" onclick={addItemToBeginning} type="button">Add to beginning</button>
		<button class="metaedit-typed-list-add-end" onclick={addItemToEnd} type="button">Add to end</button>
		<button onclick={onCancel} type="button">Cancel</button>
		<button class="mod-cta metaedit-typed-list-save" onclick={submit} type="button">Save</button>
	</div>
</div>
