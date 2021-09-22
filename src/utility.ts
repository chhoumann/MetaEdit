import {App, TAbstractFile, TFile} from "obsidian";

export function getActiveMarkdownFile(app: App): TFile {
    const activeFile: TFile = app.workspace.getActiveFile();
    const activeMarkdownFile = abstractFileToMarkdownTFile(activeFile);

    if (!activeMarkdownFile) {
        this.logError("could not get current file.");
        return null;
    }

    return activeMarkdownFile;
}

export function abstractFileToMarkdownTFile(file: TAbstractFile): TFile {
    if (file instanceof TFile && file.extension === "md")
        return file;

    return null;
}