interface Entry<T> {
  promise: Promise<T>;
  controller: AbortController;
  users: number;
  settled: boolean;
  expires: number;
  cancellation?: ReturnType<typeof setTimeout>;
}
export interface ReadLease<T> { promise: Promise<T>; release: () => void }

/** Session memory only. Errors and abandoned reads are never retained. */
export class ReadCache {
  private entries = new Map<string, Entry<unknown>>();
  constructor(private capacity: number, private freshnessMs: number, private now = Date.now) {}

  acquire<T>(key: string, load: (signal: AbortSignal) => Promise<T>): ReadLease<T> {
    let entry = this.entries.get(key) as Entry<T> | undefined;
    if (entry?.settled && entry.expires <= this.now()) {
      this.entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      const controller = new AbortController();
      const created: Entry<T> = {controller, users: 0, settled: false, expires: 0, promise: undefined!};
      created.promise = Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return load(controller.signal);
      }).then(value => {
        controller.signal.throwIfAborted();
        created.settled = true;
        created.expires = this.now() + this.freshnessMs;
        this.trim();
        return value;
      }).catch(error => {
        created.settled = true;
        if (this.entries.get(key) === created) this.entries.delete(key);
        throw error;
      });
      entry = created;
      this.entries.set(key, created);
    }
    clearTimeout(entry.cancellation);
    entry.users++;
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.trim();
    let released = false;
    return {promise: entry.promise, release: () => {
      if (released) return;
      released = true;
      entry.users--;
      if (!entry.users && !entry.settled) {
        // Allow the next screen (and StrictMode) to take over the same request.
        entry.cancellation = setTimeout(() => {
          if (entry.users || entry.settled) return;
          if (this.entries.get(key) === entry) this.entries.delete(key);
          entry.controller.abort();
        }, 0);
      }
      this.trim();
    }};
  }

  clear() {
    for (const entry of this.entries.values()) {
      clearTimeout(entry.cancellation);
      if (!entry.settled) entry.controller.abort();
    }
    this.entries.clear();
  }

  private trim() {
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= this.capacity) break;
      if (entry.users) continue;
      clearTimeout(entry.cancellation);
      if (!entry.settled) entry.controller.abort();
      this.entries.delete(key);
    }
  }
}

// Two reporting windows at most after active consumers release their leases.
export const libraryReads = new ReadCache(2, 30_000);
export const contextReads = new ReadCache(24, 20_000);
export function invalidateWorkspaceReads() { libraryReads.clear(); contextReads.clear(); }
