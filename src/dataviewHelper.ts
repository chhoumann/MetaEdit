import type {TFile, WorkspaceLeaf} from "obsidian";
import type MetaEdit from "./main";

export class DataviewHelper {
    private selectedValues: {[key: string]: string}[] = [];

    private activeLeaves: {[p: string]: {
        leaf: WorkspaceLeaf,
        addedCheckboxes: boolean,
        file: TFile
    }} = {};

    constructor(private plugin: MetaEdit) { }

    public trigger(): { [p: string]: string }[] {
        return this.selectedValues;
    }

    public start(): DataviewHelper {
        return this;
    }

    private handleCache() {
        const currentLeaves: WorkspaceLeaf[] = this.plugin.app.workspace.getLeavesOfType("markdown");

        Object.keys(this.activeLeaves).map(activeLeaf => {
            if (Object.keys(this.activeLeaves).length === 0 ||
                !currentLeaves.find(leaf => this.activeLeaves[activeLeaf]?.leaf === leaf)) {
                delete this.activeLeaves[activeLeaf];
            }
        });

        currentLeaves.forEach(leaf => {
            const {state} = leaf.getViewState();
            if (state.file && !this.activeLeaves[state.file])
                this.activeLeaves[state.file] = {leaf, addedCheckboxes: false, file: null}
        });
    }

    private addCheckboxes(item: { leaf: WorkspaceLeaf; addedCheckboxes: boolean; file: TFile }): void {
        if (item.addedCheckboxes) return;
        item.addedCheckboxes = true;

        const dvJS = document.getElementsByClassName('block-language-dataviewjs');
        const dv = document.getElementsByClassName('block-language-dataview');

        const dataviewBlocks: HTMLElement[] = [
            ...Array.prototype.slice.call(dvJS),
            ...Array.prototype.slice.call(dv),
        ];

        dataviewBlocks.forEach(block => {
            const tables = block.querySelectorAll("table");
            tables.forEach(table => {
                let headers: string[] = [];

                for (let h = 0; h < table.tHead.rows[0].cells.length; h++) {
                    headers.push(table.tHead.rows[0].cells[h].textContent);
                }

                for (let i = 0; i < table.rows.length; i++) {
                    const item = table.rows.item(i);
                    const newCell = item.insertCell(0);

                    let valuesInRow: {[key: string]: string} = {};
                    for (let h = 0; h < item.cells.length; h++) {
                        valuesInRow[headers[h - 1]] = item.cells[h].textContent;
                    }

                    if (i > 0) {
                        const checkBox = newCell.createEl('input', {type: "checkbox"});
                        checkBox.addEventListener('change', (evt: MouseEvent) => {
                            evt.preventDefault();
                            this.selectedValues.push(valuesInRow);
                        });
                    } else {
                        newCell.style.border = "none";
                    }
                }
            })
        })
    }
}