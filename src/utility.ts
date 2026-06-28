import {type App, type TAbstractFile, TFile} from "obsidian";
import {log} from "./logger/logManager";

export function getActiveMarkdownFile(app: App): TFile {
    const activeFile: TFile = app.workspace.getActiveFile();
    const activeMarkdownFile = abstractFileToMarkdownTFile(activeFile);

    if (!activeMarkdownFile) {
        // No active markdown file: log and return null so the caller (the Run
        // command) cleanly no-ops. This was `this.logError(...)`, but a plain
        // exported function has no `this`, so it threw a TypeError instead.
        log.logMessage("MetaEdit: no active markdown file.");
        return null;
    }

    return activeMarkdownFile;
}

export function abstractFileToMarkdownTFile(file: TAbstractFile): TFile {
    if (file instanceof TFile && file.extension === "md")
        return file;

    return null;
}