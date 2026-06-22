import crypto from "node:crypto";
import { runWithRequestContext } from "../utils/requestContext.js";

const requestIdMiddleware = (req, res, next) => {
  const inboundRequestId = req.get("X-Request-Id");
  const requestId = inboundRequestId || crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  return runWithRequestContext({ requestId }, next);
};

export default requestIdMiddleware;
