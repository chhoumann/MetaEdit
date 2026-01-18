import {CachedMetadata, LinkCache, Notice, TFile, getLinkpath, normalizePath} from "obsidian";
import type MetaEdit from "../../main";
import type {KanbanProperty} from "../../Types/kanbanProperty";
import {abstractFileToMarkdownTFile} from "../../utility";
import {log} from "../../logger/logManager";
import type {Property} from "../../parser";
import {OnFileModifyAutomator} from "./onFileModifyAutomator";
import {OnModifyAutomatorType} from "./onModifyAutomatorType";

const MARKDOWN_HEADING = /#+\s+(.+)/;
const TASK_REGEX = /(\s*)-\s*\[([ Xx\.]?)\]\s*(.+)/i;

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

        await this.updateFilesInBoard(links, targetBoard, file.path, kanbanBoardFileContent);
    }

    private findBoardByName(boardName: string): KanbanProperty {
        return this.boards.find(board => board.boardName === boardName);
    }

    private resolveLinkFile(link: LinkCache, sourcePath: string): TFile | null {
        const linkpath = this.normalizeLinkpath(link?.link);
        if (!linkpath) return null;

        const candidates = this.buildLinkpathCandidates(linkpath);
        const resolvedFromCache = this.resolveByMetadataCache(candidates, sourcePath);
        if (resolvedFromCache) return resolvedFromCache;

        const resolvedByPath = this.resolveByPathCandidates(candidates);
        if (resolvedByPath) return resolvedByPath;

        return this.resolveByBasenameCandidates(candidates);
    }

    private normalizeLinkpath(link: string): string | null {
        if (!link) return null;

        let normalized = link;
        try {
            normalized = decodeURIComponent(normalized);
        } catch {
            // Keep original link if decoding fails
        }

        normalized = normalized.replace(/^\/+/, "");
        normalized = normalizePath(normalized);
        return getLinkpath(normalized);
    }

    private buildLinkpathCandidates(linkpath: string): string[] {
        const withoutExtension = this.stripMarkdownExtension(linkpath);
        return Array.from(new Set([linkpath, withoutExtension]));
    }

    private stripMarkdownExtension(path: string): string {
        return path.toLowerCase().endsWith(".md") ? path.slice(0, -3) : path;
    }

    private ensureMarkdownExtension(path: string): string {
        return path.toLowerCase().endsWith(".md") ? path : `${path}.md`;
    }

    private resolveByMetadataCache(candidates: string[], sourcePath: string): TFile | null {
        for (const candidate of candidates) {
            const resolved = this.app.metadataCache.getFirstLinkpathDest(candidate, sourcePath);
            if (resolved) return resolved;
        }
        return null;
    }

    private resolveByPathCandidates(candidates: string[]): TFile | null {
        for (const candidate of candidates) {
            const file = this.app.vault.getAbstractFileByPath(this.ensureMarkdownExtension(candidate));
            const markdownFile = abstractFileToMarkdownTFile(file);
            if (markdownFile) return markdownFile;
        }
        return null;
    }

    private resolveByBasenameCandidates(candidates: string[]): TFile | null {
        const markdownFiles: TFile[] = this.app.vault.getMarkdownFiles();
        for (const candidate of candidates) {
            if (candidate.includes("/")) continue;
            const basename = this.stripMarkdownExtension(candidate.split("/").pop() ?? "");
            if (!basename) continue;
            const found = markdownFiles.find(f => f.basename === basename);
            if (found) return found;
        }
        return null;
    }

    private isMarkdownFile(file: TFile | null): file is TFile {
        return !!file && file.extension === "md";
    }

    private async updateFilesInBoard(
        links: LinkCache[],
        board: KanbanProperty,
        sourcePath: string,
        kanbanBoardFileContent: string
    ) {
        for (const link of links) {
            const linkFile = this.resolveLinkFile(link, sourcePath);
            if (!this.isMarkdownFile(linkFile)) {
                log.logMessage(`${link.link} is not updatable for the KanbanHelper.`);
                continue;
            }

            await this.updateFileInBoard(link, linkFile, board, kanbanBoardFileContent);
        }
    }

    private async updateFileInBoard(link: LinkCache, linkFile: TFile, board: KanbanProperty, kanbanBoardFileContent: string)
        : Promise<void>
    {
        const heading: string = this.getTaskHeading(link.original, kanbanBoardFileContent);
        if (!heading) {
            log.logMessage(`found linked file ${link.link} but could not get heading for task.`);
            return;
        }

        const fileProperties: Property[] = await this.plugin.controller.getPropertiesInFile(linkFile);
        if (!fileProperties) {
            log.logWarning(`No properties found in '${board.boardName}', cannot update '${board.property}'.`)
            return;
        }
        const targetProperty = fileProperties.find(prop => prop.key === board.property);
        if (!targetProperty) {
            log.logWarning(`'${board.property}' not found in '${board.boardName}' for file "${linkFile.name}".`);
            new Notice(`'${board.property}' not found in '${board.boardName}' for file "${linkFile.name}".`); // This notice will help users debug "Property not found in board" errors.
            return;
        }

        const propertyHasChanged = targetProperty.content !== heading;
        if (propertyHasChanged) {
            console.debug(`Updating ${targetProperty.key} of file ${linkFile.name} to ${heading}`);
            await this.plugin.controller.updatePropertyInFile(targetProperty, heading, linkFile);
        }
    }

    private getTaskHeading(targetTaskContent: string, fileContent: string): string | null {
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
