import type {DatedFileCacheItem} from "./Types/datedFileCacheItem";

export class UpdatedFileCache {
    private map: Map<string, DatedFileCacheItem>;

    constructor() {
        this.map = new Map();
    }

    public get(key: string): DatedFileCacheItem | undefined {
        return this.map.get(key);
    }

    public set(key: string, content: string): boolean {
        if (this.map.has(key) && this.map.get(key).content === content)
            return false;

        this.map.set(key, {content, updateTime: Date.now()});
        this.clean();

        return true;
    }

    public delete(key: string) {
        this.map.delete(key);
    }

    private clean() {
        const five_minutes: number = 300_000;

        this.map.forEach((item, key) => {
            if (item.updateTime < Date.now() - five_minutes) {
                this.delete(key);
            }
        });
    }
}