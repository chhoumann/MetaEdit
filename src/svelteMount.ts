import {mount, unmount} from "svelte";

export type MountedSvelteComponent = Record<string, unknown>;

export function mountSvelteComponent(
	component: any,
	target: HTMLElement,
	props?: Record<string, unknown>,
): MountedSvelteComponent {
	return mount(component, {target, props}) as MountedSvelteComponent;
}

export function unmountSvelteComponent(component: MountedSvelteComponent | null | undefined): void {
	if (!component) return;
	void unmount(component);
}
