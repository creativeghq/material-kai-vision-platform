interface Slot<T> { value: T; ready: boolean; inflight: Promise<void> | null; listeners: Set<() => void> }

export class KeyedStore<T> {
  private slots = new Map<string, Slot<T>>();
  constructor(private readonly initial: () => T, private readonly fetcher: (key: string) => Promise<T>) {}

  slot(key: string): Slot<T> {
    let s = this.slots.get(key);
    if (!s) {
      s = { value: this.initial(), ready: false, inflight: null, listeners: new Set() };
      this.slots.set(key, s);
    }
    return s;
  }

  refresh(key: string): Promise<void> {
    const s = this.slot(key);
    s.inflight ??= this.fetcher(key)
      .then((v) => { s.value = v; s.ready = true; })
      .catch(() => { s.ready = false; })
      .finally(() => { s.inflight = null; this.notify(key); });
    return s.inflight;
  }

  set(key: string, update: (prev: T) => T) {
    const s = this.slot(key);
    s.value = update(s.value);
    this.notify(key);
  }

  subscribe(key: string, listener: () => void): () => void {
    const s = this.slot(key);
    s.listeners.add(listener);
    return () => { s.listeners.delete(listener); };
  }

  private notify(key: string) { this.slot(key).listeners.forEach((l) => l()); }
}
