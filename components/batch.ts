/** Processes items in batches with specified executor and concurrency limit */
export const batch = async <T, N>(
  list: T[],
  executor: (arg: T, index: number) => Promise<N>,
  concurrencyLimit = 3,
  verbose = false,
  abort?: () => unknown | null | undefined
) => {
  const activeTasks: Promise<void>[] = [];
  const responses: N[] = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];

    if (abort) {
      const shouldAbort = abort();
      if (shouldAbort !== null && shouldAbort !== undefined && shouldAbort !== false) {
        verbose && console.warn("Batch abort", shouldAbort);
        break;
      }
    }

    if (activeTasks.length >= concurrencyLimit) {
      await Promise.all(activeTasks);
    }

    verbose && console.info(`Start task: ${item}`);

    const activeTask = new Promise<N>((resolve, reject) => {
      try {
        executor(item, i).then(resolve).catch(reject);
      } catch (e) {
        reject(e);
      }
    })
      .then((response: N) => {
        responses.push(response);
        activeTasks.splice(activeTasks.indexOf(activeTask), 1);
        verbose && console.info(`End task: ${item}`);
      })
      .catch((error) => {
        activeTasks.splice(activeTasks.indexOf(activeTask), 1);
        verbose && console.info(`End task: ${item}`, error);
        throw error;
      });

    activeTasks.push(activeTask);
  }

  if (activeTasks.length > 0) {
    await Promise.all(activeTasks);
  }

  return responses;
};
