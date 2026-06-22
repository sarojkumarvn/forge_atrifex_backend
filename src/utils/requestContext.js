import { AsyncLocalStorage } from "node:async_hooks";

const requestContext = new AsyncLocalStorage();

export const runWithRequestContext = (context, callback) => requestContext.run(context, callback);

export const getRequestContext = () => requestContext.getStore() || {};

export const getRequestId = () => getRequestContext().requestId;

export const getRequestLoggerMeta = () => {
  const context = getRequestContext();
  return context.requestId ? { requestId: context.requestId } : {};
};
