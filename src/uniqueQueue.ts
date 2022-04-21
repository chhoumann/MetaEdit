export class UniqueQueue<T> {
    private readonly elements: T[];

    constructor() {
        this.elements = [];
    }

    public enqueue(item: T): boolean {
        if (this.elements.find((i) => i === item)) {
            return false;
        }

        this.elements.push(item);
        return true;
    }

    public dequeue(): T | undefined {
        return this.elements.shift();
    }

    public peek(): T | undefined {
        return this.elements[0];
    }

    public isEmpty(): boolean {
        return this.elements.length === 0;
    }

    public length(): number {
        return this.elements.length;
    }
}
