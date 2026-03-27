export interface LifecycleScope {
  add: (cleanup: () => void) => () => void;
  on: (
    target: EventTarget,
    eventName: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ) => () => void;
  dispose: () => void;
}

export const createLifecycleScope = (): LifecycleScope => {
  const cleanups = new Set<() => void>();
  let disposed = false;

  const add = (cleanup: () => void): (() => void) => {
    if (disposed) {
      try {
        cleanup();
      } catch {
        // no-op
      }
      return () => {
        // no-op
      };
    }

    cleanups.add(cleanup);

    return () => {
      cleanups.delete(cleanup);
    };
  };

  const on = (
    target: EventTarget,
    eventName: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ): (() => void) => {
    target.addEventListener(eventName, listener, options);
    return add(() => {
      target.removeEventListener(eventName, listener, options);
    });
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    const queued = Array.from(cleanups).reverse();
    cleanups.clear();

    for (const cleanup of queued) {
      try {
        cleanup();
      } catch {
        // no-op
      }
    }
  };

  return {
    add,
    on,
    dispose,
  };
};
