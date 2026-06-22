export const sendSuccess = (res, statusCode, message, data = null, meta = null) => {
  const response = {
    success: true,
    message,
    data: data ?? {},
  };

  if (meta !== null) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
};
