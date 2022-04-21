import { UniqueQueue } from '../src/uniqueQueue';

export {};

test('UniqueQueue_enqueue_isEmptyFalseOnAdd', () => {
    const queue = new UniqueQueue<number>();
    queue.enqueue(1);

    expect(queue.isEmpty()).toBe(false);
});

test('UniqueQueue_isEmpty_TrueOnEmpty', () => {
    const queue = new UniqueQueue<number>();

    expect(queue.isEmpty()).toBe(true);
});

test('UniqueQueue_enqueue_OnlyUniqueItemsInQueue', () => {
    const queue = new UniqueQueue<number>();
    queue.enqueue(1);
    queue.enqueue(1);
    queue.enqueue(1);
    queue.enqueue(1);

    expect(queue.length()).toBe(1);
});

test('UniqueQueue_dequeue_RemoveItemFromQueue', () => {
    const queue = new UniqueQueue<number>();
    queue.enqueue(1);

    expect(queue.length()).toBe(1);
    expect(queue.dequeue()).toBe(1);
    expect(queue.length()).toBe(0);
});

test('UniqueQueue_dequeue_RemoveItemFromEmptyQueue', () => {
    const queue = new UniqueQueue<number>();

    expect(queue.isEmpty()).toBe(true);
    expect(queue.dequeue()).toBe(undefined);
});

test('UniqueQueue_peek_ShowFrontOfQueue', () => {
    const queue = new UniqueQueue<number>();
    expect(queue.peek()).toBe(undefined);

    queue.enqueue(1);

    expect(queue.peek()).toBe(1);
});

test('UniqueQueue_peek_UndefinedOnNoQueue', () => {
    const queue = new UniqueQueue<number>();

    expect(queue.peek()).toBe(undefined);
});
