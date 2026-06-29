import {type CachedMetadata, type HeadingCache, type LinkCache, Notice, type TFile, getLinkpath, normalizePath} from "obsidian";
import type MetaEdit from "../../main";
import type {KanbanProperty} from "../../Types/kanbanProperty";
import {abstractFileToMarkdownTFile} from "../../utility";
import {log} from "../../logger/logManager";
import type {Property} from "../../parser";
import {OnFileModifyAutomator} from "./onFileModifyAutomator";
import {OnModifyAutomatorType} from "./onModifyAutomatorType";

// A Kanban card is a top-level task line whose content begins with the card's
// link: "- [ ] [[Note]] ...". Only that leading link identifies the note to keep
// in sync with the lane; any trailing links on the same line (Kanban "@[[date]]"
// links, "see [[ref]]" references) belong to the card's text and must be ignored.
// The prefix is everything before the link, so it may contain only the list
// marker, the checkbox, and whitespace. Indented sub-checklist items are excluded
// (no leading whitespace) because Kanban cards are always top-level.
const CARD_LINK_PREFIX = /^-\s+\[[^\]]?\]\s+$/;

export class KanbanHelper extends OnFileModifyAutomator {
    private get boards(): KanbanProperty[] { return this.plugin.settings.KanbanHelper.boards }

    constructor(plugin: MetaEdit) {
        super(plugin, OnModifyAutomatorType.KanbanHelper);
    }

    public async onFileModify(file: TFile): Promise<void> {
        const targetBoard = this.findBoardByName(file.basename);
        if (!targetBoard) return;

        const kanbanBoardFileCache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
        if (!kanbanBoardFileCache?.links) return;

        const kanbanBoardFileContent: string = await this.app.vault.cachedRead(file);
        const boardLines = kanbanBoardFileContent.split("\n");
        const laneForLine = this.buildLaneResolver(kanbanBoardFileCache.headings);

        await this.updateFilesInBoard(kanbanBoardFileCache.links, targetBoard, file.path, boardLines, laneForLine);
    }

    private findBoardByName(boardName: string): KanbanProperty {
        return this.boards.find(board => board.boardName === boardName);
    }

    private async updateFilesInBoard(
        links: LinkCache[],
        board: KanbanProperty,
        sourcePath: string,
        boardLines: string[],
        laneForLine: (line: number) => string | null
    ): Promise<void> {
        for (const link of links) {
            // Each card is processed in isolation: a bad link or a failed update of one
            // card must never abort syncing of the rest of the board (issue #80, fault 1).
            try {
                // Only the card's leading link is updatable; date/reference links are skipped.
                if (!this.isCardLink(link, boardLines)) continue;

                const lane = laneForLine(link.position.start.line);
                // A card placed above any lane heading has no lane to write.
                if (!lane) continue;

                const linkFile = this.resolveLinkFile(link, sourcePath);
                if (!this.isMarkdownFile(linkFile)) {
                    log.logMessage(`${link.link} is not updatable for the KanbanHelper.`);
                    continue;
                }

                await this.updateFileInBoard(linkFile, board, lane);
            } catch (error) {
                // e.g. a linked note with malformed YAML makes getPropertiesInFile throw.
                // logMessage is used (not logError, which re-throws) so one failing card
                // is logged without aborting the rest or spamming a notice every edit.
                const reason = error instanceof Error ? error.message : String(error);
                log.logMessage(`KanbanHelper could not update '${link.link}': ${reason}`);
            }
        }
    }

    // A card link is the leading link of a top-level task line. We verify against the
    // freshly-read board content that the cached link still sits at its recorded
    // position with its recorded text; on a mismatch (the card moved or changed since
    // the cache was built) the link is skipped rather than acted on with stale data.
    // This validates the link's own identity only; it does not reconcile a lane
    // heading that was renamed in place while the cache lagged (a transient state the
    // 5s modify debounce makes negligible and that self-corrects on the next edit).
    private isCardLink(link: LinkCache, boardLines: string[]): boolean {
        const start = link.position?.start;
        if (!start) return false;

        const line = boardLines[start.line];
        if (line === undefined) return false;

        if (!line.slice(start.col).startsWith(link.original)) return false;

        return CARD_LINK_PREFIX.test(line.slice(0, start.col));
    }

    // Map any line to its lane: the text of the nearest heading at or above it.
    // Headings come from the metadata cache so ATX-closed ("## Done ##") and
    // setext headings resolve to their clean lane name, matching Obsidian.
    private buildLaneResolver(headings?: HeadingCache[]): (line: number) => string | null {
        const orderedHeadings = (headings ?? [])
            .slice()
            .sort((a, b) => a.position.start.line - b.position.start.line);

        return (line: number) => {
            let lane: string | null = null;
            for (const heading of orderedHeadings) {
                if (heading.position.start.line > line) break;
                lane = heading.heading;
            }
            return lane;
        };
    }

    private async updateFileInBoard(linkFile: TFile, board: KanbanProperty, lane: string): Promise<void> {
        const fileProperties: Property[] = await this.plugin.controller.getPropertiesInFile(linkFile);
        const targetProperty = fileProperties.find(prop => prop.key === board.property && !prop.isVirtual);
        if (!targetProperty) {
            // Only real card notes reach this point, so the warning is now actionable.
            const message = `'${board.property}' not found in "${linkFile.basename}" (Kanban board '${board.boardName}').`;
            log.logWarning(message);
            new Notice(message); // This notice helps users debug "property not found" errors.
            return;
        }

        const propertyHasChanged = targetProperty.content !== lane;
        if (propertyHasChanged) {
            console.debug(`Updating ${targetProperty.key} of file ${linkFile.name} to ${lane}`);
            await this.plugin.controller.updatePropertyInFile(targetProperty, lane, linkFile);
        }
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

    // Last-resort fallback for links the metadata cache and direct path lookup both
    // miss (e.g. an as-yet-unresolved link or a cold cache). A basename is only a
    // safe target when exactly one note carries it: if several notes share it we
    // cannot know which the card meant, so we bail rather than write the lane to an
    // arbitrarily-chosen same-named note (silent data corruption). When the cache is
    // warm Obsidian's own shortest-path resolution in resolveByMetadataCache already
    // picked the note the board displays, so this path is reached only on a true miss.
    private resolveByBasenameCandidates(candidates: string[]): TFile | null {
        const markdownFiles: TFile[] = this.app.vault.getMarkdownFiles();
        for (const candidate of candidates) {
            if (candidate.includes("/")) continue;
            const basename = this.stripMarkdownExtension(candidate.split("/").pop() ?? "");
            if (!basename) continue;
            const matches = markdownFiles.filter(f => f.basename === basename);
            if (matches.length === 1) return matches[0];
            if (matches.length > 1) {
                log.logMessage(
                    `KanbanHelper: "${basename}" is ambiguous (${matches.length} notes share this name); ` +
                    `skipping the card so its lane is not written to the wrong note.`
                );
                return null;
            }
        }
        return null;
    }

    private isMarkdownFile(file: TFile | null): file is TFile {
        return !!file && file.extension === "md";
    }
}
