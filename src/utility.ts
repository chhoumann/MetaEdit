import { TAbstractFile, TFile } from 'obsidian';
import { log } from './logger/logManager';

export function getActiveMarkdownFile(): TFile | null {
    const activeFile: TFile | null = app.workspace.getActiveFile();

    if (!activeFile) {
        log.logError('No active file');
        return null;
    }

    const activeMarkdownFile = abstractFileToMarkdownTFile(activeFile);

    if (!activeMarkdownFile) {
        log.logError('could not get current file.');
        return null;
    }

    return activeMarkdownFile;
}

export function abstractFileToMarkdownTFile(
    file: TAbstractFile | TFile,
): TFile | null {
    if (file instanceof TFile && file.extension === 'md') return file;

    return null;
}
