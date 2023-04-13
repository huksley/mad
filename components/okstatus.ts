/**
 * Response which can have { error: "msg" } response body
 *
 * DOM Response and node-fetch (v.2.6.7) response are different a bit so we
 * declare this type which is the only thing we need from fetch response
 **/
interface JSONResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly url?: string;
  readonly headers: {
    get: (name: string) => string | null;
  };
  json(): Promise<any>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * Checks fetch response and if not ok HTTP response, rejects with error from response.
 */
export const okstatus = <T extends JSONResponse>(response: T): Promise<T> =>
  new Promise((resolve, reject) => {
    if (response.ok) {
      resolve(response);
    } else {
      const contentType = response.headers.get("content-type");
      if (contentType === "application/json" || contentType?.startsWith("application/json")) {
        try {
          response
            .json()
            .then((body) => {
              if (body && body.error) {
                reject({
                  status: response.status,
                  message: body.error,
                  response: body,
                });
              } else if (response.status > 399 && body && body.message) {
                reject({
                  status: response.status,
                  message: body.message,
                  response: body,
                });
              } else {
                reject({
                  status: response.status,
                  message: JSON.stringify(body),
                  response: body,
                });
              }
            })
            .catch((error) => {
              console.warn(
                "Request",
                response.url,
                "failed, error",
                response.status,
                error?.message || String(error),
                error,
                response.headers.get("content-type")
              );
              return reject({ message: error.message });
            });
        } catch (error) {
          const msg = (error as { message?: string })?.message || String(error);
          console.warn("Request", response.url, "failed, error", response.status, msg, error);
          reject({ message: msg });
        }
      } else {
        console.warn("Request", response.url, "failed, error", response.status, response.statusText);
        reject({ message: response.statusText });
      }
    }
  });
