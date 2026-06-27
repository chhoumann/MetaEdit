import {
	mount,
	unmount,
	type Component,
	type ComponentType,
	type SvelteComponent,
} from "svelte";

export type MountedSvelteComponent = Record<string, unknown>;
type SvelteMountableComponent = Component<any, any> | ComponentType<SvelteComponent<any>>;
type PropsOf<TComponent> =
	TComponent extends Component<infer Props, any> ? Props :
	TComponent extends ComponentType<SvelteComponent<infer Props>> ? Props :
	never;

export function mountSvelteComponent<TComponent extends SvelteMountableComponent>(
	component: TComponent,
	target: HTMLElement,
	props: PropsOf<TComponent>,
): MountedSvelteComponent {
	return mount(
		component as Component<PropsOf<TComponent>, MountedSvelteComponent>,
		{target, props},
	) as MountedSvelteComponent;
}

export function unmountSvelteComponent(component: MountedSvelteComponent | null | undefined): void {
	if (!component) return;
	void unmount(component);
}
