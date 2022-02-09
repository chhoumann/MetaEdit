import {CachedMetadata, LinkCache, Notice, TFile} from "obsidian";
import type MetaEdit from "../../main";
import type {KanbanProperty} from "../../Types/kanbanProperty";
import {abstractFileToMarkdownTFile} from "../../utility";
import {log} from "../../logger/logManager";
import type {Property} from "../../parser";
import {OnFileModifyAutomator} from "./onFileModifyAutomator";
import {OnModifyAutomatorType} from "./onModifyAutomatorType";

export class KanbanHelper extends OnFileModifyAutomator {
    private get boards(): KanbanProperty[] { return this.plugin.settings.KanbanHelper.boards }

    constructor(plugin: MetaEdit) {
        super(plugin, OnModifyAutomatorType.KanbanHelper);
    }

    public async onFileModify(file: TFile): Promise<void> {
        const kanbanBoardFileContent: string = await this.app.vault.cachedRead(file);
        const kanbanBoardFileCache: CachedMetadata = this.app.metadataCache.getFileCache(file);
        const targetBoard = this.findBoardByName(file.basename);
        if (!targetBoard || !kanbanBoardFileCache) return;

        const {links} = kanbanBoardFileCache;
        if (!links) return;

        await this.updateFilesInBoard(links, targetBoard, kanbanBoardFileContent);
    }

    private findBoardByName(boardName: string): KanbanProperty {
        return this.boards.find(board => board.boardName === boardName);
    }

    private getLinkFile(link: LinkCache): TFile {
        const markdownFiles: TFile[] = this.app.vault.getMarkdownFiles();
        return markdownFiles.find(f => f.path.includes(`${link.link}.md`));
    }

    private async updateFilesInBoard(links: LinkCache[], board: KanbanProperty, kanbanBoardFileContent: string) {
        for (const link of links) {
            const linkFile: TFile = this.getLinkFile(link);
            const linkIsMarkdownFile: boolean = !!abstractFileToMarkdownTFile(linkFile);
            if (!linkFile || !linkIsMarkdownFile) {
                log.logMessage(`${link.link} is not updatable for the KanbanHelper.`);
                return;
            }

            await this.updateFileInBoard(link, linkFile, board, kanbanBoardFileContent);
        }
    }

    private async updateFileInBoard(link: LinkCache, linkFile: TFile, board: KanbanProperty, kanbanBoardFileContent: string)
        : Promise<void>
    {
        const heading: string = this.getTaskHeading(link.original, kanbanBoardFileContent);
        if (!heading) {
            log.logWarning("found linked file but could not get heading for task.");
            return;
        }

        const fileProperties: Property[] = await this.plugin.controller.getPropertiesInFile(linkFile);
        if (!fileProperties) {
            log.logWarning(`No properties found in '${board.boardName}', cannot update '${board.property}'.`)
            return;
        }
        const targetProperty = fileProperties.find(prop => prop.key === board.property);
        if (!targetProperty) {
            log.logWarning(`'${board.property} not found in ${board.boardName} for file "${linkFile.name}".'`);
            new Notice(`'${board.property} not found in ${board.boardName} for file "${linkFile.name}".'`); // This notice will help users debug "Property not found in board" errors.
            return;
        }

        const propertyHasChanged = (targetProperty.content != heading); // Kanban Helper will check if the file's property is different from its current heading in the kanban and will only make changes to the file if there's a difference
        if (propertyHasChanged) {
            console.debug("Updating " + targetProperty.key + " of file " + linkFile.name + " to " + heading);
            await this.plugin.controller.updatePropertyInFile(targetProperty, heading, linkFile);
        }
    }

    private getTaskHeading(targetTaskContent: string, fileContent: string): string | null {
        const MARKDOWN_HEADING = new RegExp(/#+\s+(.+)/);
        const TASK_REGEX = new RegExp(/(\s*)-\s*\[([ Xx\.]?)\]\s*(.+)/, "i");

        let lastHeading: string = "";
        const contentLines = fileContent.split("\n");
        for (const line of contentLines) {
            const headingMatch = MARKDOWN_HEADING.exec(line);

            if (headingMatch) {
                const headingText = headingMatch[1];
                lastHeading = headingText;
            }

            const taskMatch = TASK_REGEX.exec(line);
            if (taskMatch) {
                const taskContent = taskMatch[3];

                if (taskContent.includes(targetTaskContent)) {
                    return lastHeading;
                }
            }
        }

        return null;
    }
}