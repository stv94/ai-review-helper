// Singleton wrapper around acquireVsCodeApi() — must be called at most once per page lifetime.

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
};

let _api: ReturnType<typeof acquireVsCodeApi> | null = null;

function getApi() {
  if (!_api) {
    _api = acquireVsCodeApi();
  }
  return _api;
}

export function postMessage(msg: object): void {
  getApi().postMessage(msg);
}
