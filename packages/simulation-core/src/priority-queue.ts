/**
 * Priority queue backed by a binary min-heap for deterministic discrete-event scheduling.
 */
export class PriorityQueue<T> {
  private heap: { priority: number; item: T }[] = [];

  enqueue(item: T, priority: number): void {
    this.heap.push({ priority, item });
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const min = this.heap[0]?.item;
    const end = this.heap.pop();
    if (this.heap.length > 0 && end !== undefined) {
      this.heap[0] = end;
      this.sinkDown(0);
    }
    return min;
  }

  peek(): T | undefined {
    return this.heap[0]?.item;
  }

  peekPriority(): number | undefined {
    return this.heap[0]?.priority;
  }

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  private bubbleUp(index: number): void {
    const element = this.heap[index];
    if (!element) return;

    while (index > 0) {
      const parentIdx = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIdx];
      if (!parent || element.priority >= parent.priority) break;
      this.heap[index] = parent;
      this.heap[parentIdx] = element;
      index = parentIdx;
    }
  }

  private sinkDown(index: number): void {
    const length = this.heap.length;
    const element = this.heap[index];
    if (!element) return;

    while (true) {
      const leftChildIdx = 2 * index + 1;
      const rightChildIdx = 2 * index + 2;
      let leftChild: { priority: number; item: T } | undefined;
      let rightChild: { priority: number; item: T } | undefined;
      let swap: number | null = null;

      if (leftChildIdx < length) {
        leftChild = this.heap[leftChildIdx];
        if (leftChild && leftChild.priority < element.priority) {
          swap = leftChildIdx;
        }
      }

      if (rightChildIdx < length) {
        rightChild = this.heap[rightChildIdx];
        if (
          rightChild &&
          ((swap === null && rightChild.priority < element.priority) ||
            (swap !== null && leftChild && rightChild.priority < leftChild.priority))
        ) {
          swap = rightChildIdx;
        }
      }

      if (swap === null) break;
      const target = this.heap[swap];
      if (!target) break;
      this.heap[index] = target;
      this.heap[swap] = element;
      index = swap;
    }
  }
}
