export interface EntityStore<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  all(): Promise<Record<string, T>>;   // map keyed by id — convenience for the engine
  create(entity: T): Promise<T>;
  update(id: string, entity: T): Promise<T>;
  remove(id: string): Promise<void>;
}

export class StoreError extends Error {
  constructor(message: string, public kind: 'conflict' | 'notFound') {
    super(message);
    this.name = 'StoreError';
  }
}
