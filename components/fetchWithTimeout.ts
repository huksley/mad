const DEFAULT_TIMEOUT = 10000;

export const fetchWithTimeout = async (url: RequestInfo, init?: RequestInit & { timeout?: number }) => {
  const timeout = init?.timeout || DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("Request timeout " + timeout + " ms"), timeout);
  const response: Response | undefined = await fetch(url, {
    ...init,
    // FIXME: signal definitions are incompatible
    signal: controller.signal,
  } as RequestInit);

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  return response;
};
