import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";

const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError("You are not authorized to access this resource"));
    }

    return next();
  };
};

export default roleMiddleware;
