/** Only the latest request may publish a result, even if a transport ignores abort. */
export function createLatestRequest() {
  let sequence = 0;
  let controller: AbortController | undefined;
  return {
    run<T>(request: (signal: AbortSignal) => Promise<T>, resolve: (value: T) => void, reject: (error: unknown) => void) {
      controller?.abort();
      const ownController = new AbortController();
      controller = ownController;
      const ownSequence = ++sequence;
      const current = () => sequence === ownSequence && !ownController.signal.aborted;
      void (async () => {
        try {
          const value = await request(ownController.signal);
          if (current()) resolve(value);
        } catch (error) {
          if (current()) reject(error);
        }
      })();
      return () => {
        ownController.abort();
        if (sequence === ownSequence) sequence++;
      };
    },
  };
}
