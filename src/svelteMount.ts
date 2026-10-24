import {mount, unmount, type Component} from "svelte";

export type MountedSvelteComponent = Record<string, unknown>;

export function mountSvelteComponent<Props extends Record<string, any>>(
	component: Component<Props>,
	target: HTMLElement,
	props: NoInfer<Props>,
): MountedSvelteComponent {
	return mount(component, {target, props}) as MountedSvelteComponent;
}

export function unmountSvelteComponent(component: MountedSvelteComponent | null | undefined): void {
	if (!component) return;
	void unmount(component);
}
