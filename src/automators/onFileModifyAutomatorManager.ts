import type { App, TAbstractFile, TFile } from 'obsidian';
import { debounce } from 'obsidian';
import { UniqueQueue } from '../types/uniqueQueue';
import { UpdatedFileCache } from '../types/updatedFileCache';
import { log } from '../logger/logManager';
import type MetaEdit from '../main';
import { abstractFileToMarkdownTFile } from '../utility';
import type { IOnFileModifyAutomator } from './onFileModifyAutomators/IOnFileModifyAutomator';
import type { IAutomatorManager } from './IAutomatorManager';
import type { OnModifyAutomatorType } from './onFileModifyAutomators/onModifyAutomatorType';

export class OnFileModifyAutomatorManager implements IAutomatorManager {
    private plugin: MetaEdit;
    private app: App;

    private updateFileQueue: UniqueQueue<TFile> = new UniqueQueue<TFile>();
    private updatedFileCache: UpdatedFileCache = new UpdatedFileCache();
    private automators: IOnFileModifyAutomator[] = [];
    private readonly notifyDelay: number = 5000;

    constructor(plugin: MetaEdit) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    startAutomators(): IAutomatorManager {
        this.plugin.registerEvent(
            this.plugin.app.vault.on('modify', (file) =>
                this.onFileModify(file),
            ),
        );

        return this;
    }

    attach(automator: IOnFileModifyAutomator): IAutomatorManager {
        const isExist = this.automators.some(
            (tAuto) => tAuto.type === automator.type,
        );
        if (isExist) {
            log.logWarning(
                `a ${automator.type} automator is already attached.`,
            );
            return this;
        }

        this.automators.push(automator);
        return this;
    }

    detach(automatorType: OnModifyAutomatorType): IAutomatorManager {
        const automatorIndex = this.automators.findIndex(
            (automator) => automator.type === automatorType,
        );
        if (automatorIndex === -1) {
            log.logMessage(
                `automator of type '${automatorType}' does not exist.`,
            );
            return this;
        }

        this.automators.splice(automatorIndex, 1);
        return this;
    }

    private async onFileModify(file: TAbstractFile): Promise<void> {
        const outfile: TFile | null = abstractFileToMarkdownTFile(file);
        if (!outfile) return;

        // Return on Excalidraw files to prevent conflict with its auto-save feature.
        const metadata = await this.app.metadataCache.getFileCache(outfile);
        if (metadata?.frontmatter != null) {
            // Don't try to use frontmatter if it doesn't exist.
            const keys = Object.keys(metadata?.frontmatter);
            if (
                keys &&
                keys.some((key) => key.toLowerCase().contains('excalidraw'))
            ) {
                return;
            }

            const fileContent: string = await this.app.vault.cachedRead(
                outfile,
            );
            if (!this.updatedFileCache.set(outfile.path, fileContent)) return;

            if (this.updateFileQueue.enqueue(outfile)) {
                this.notifyAutomators();
            }
        }
    }

    private notifyAutomators = debounce(
        async () => {
            while (!this.updateFileQueue.isEmpty()) {
                const file = this.updateFileQueue.dequeue();

                for (const automator of this.automators) {
                    if (file) {
                        await automator.onFileModify(file);
                    }
                }
            }
        },
        this.notifyDelay,
        true,
    );
}
