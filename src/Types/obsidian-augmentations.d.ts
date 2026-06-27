import "obsidian";

// The bundled obsidian@1.4.4 typings predate the multi-select `files-menu`
// workspace event (present at runtime since Obsidian 0.15). Declare it here so
// the bulk multi-select entry point is typed rather than cast through `any`.
declare module "obsidian" {
	interface Workspace {
		on(
			name: "files-menu",
			callback: (
				menu: Menu,
				files: TAbstractFile[],
				source: string,
				leaf?: WorkspaceLeaf,
			) => unknown,
			ctx?: unknown,
		): EventRef;
	}
}
