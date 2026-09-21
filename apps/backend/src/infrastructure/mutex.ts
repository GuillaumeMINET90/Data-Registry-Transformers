import type { UnitOfWork } from '../domain/ports.js';
export class SerialUnitOfWork implements UnitOfWork {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation);
    this.tail = next.catch(() => undefined);
    return next;
  }
}
