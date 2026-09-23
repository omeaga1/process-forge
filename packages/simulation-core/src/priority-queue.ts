/**
 * Priority queue backed by a binary min-heap for deterministic discrete-event scheduling.
 *
 * Entries are ordered by (priority, insertion sequence). Without the sequence,
 * events at the same timestamp came out in whatever order the heap's shape
 * happened to leave them -- deterministic for a given run, but not FIFO, and
 * it changed whenever an unrelated event was added. For a discrete-event
 * simulation, "these happened at the same instant" must resolve in the order
 * they were scheduled. See docs/audit/02-engine.md §1.
 */
interface Entry<T> {
  priority: number;
  seq: number;
  item: T;
}

export class PriorityQueue<T> {
  private heap: Entry<T>[] = [];
  private nextSeq = 0;

  enqueue(item: T, priority: number): void {
    this.heap.push({ priority, seq: this.nextSeq++, item });
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

  /** Strict ordering: earlier priority first, then earlier insertion. */
  private less(a: Entry<T>, b: Entry<T>): boolean {
    return a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq);
  }

  private swap(i: number, j: number): void {
    const t = this.heap[i]!;
    this.heap[i] = this.heap[j]!;
    this.heap[j] = t;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.less(this.heap[index]!, this.heap[parent]!)) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  private sinkDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      const left = 2 * index + 1;
      const right = left + 1;
      let smallest = index;
      if (left < length && this.less(this.heap[left]!, this.heap[smallest]!)) smallest = left;
      if (right < length && this.less(this.heap[right]!, this.heap[smallest]!)) smallest = right;
      if (smallest === index) break;
      this.swap(index, smallest);
      index = smallest;
    }
  }
}
