// Central error handling: friendly messages, no stack traces to clients.
class ApiError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
  static badRequest(msg = "Invalid request.", code = "BAD_REQUEST") { return new ApiError(400, msg, code); }
  static unauthorized(msg = "Authentication required.", code = "UNAUTHENTICATED") { return new ApiError(401, msg, code); }
  static forbidden(msg = "You do not have permission for this action.", code = "FORBIDDEN") { return new ApiError(403, msg, code); }
  static notFound(msg = "Resource not found.", code = "NOT_FOUND") { return new ApiError(404, msg, code); }
  static unavailable(msg = "Service temporarily unavailable. Please try again.", code = "UNAVAILABLE") { return new ApiError(503, msg, code); }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Image too large. Maximum file size is 10 MB.", code: "FILE_TOO_LARGE" });
  }
  if (err && err.code === "LIMIT_FILE_COUNT") {
    return res.status(413).json({ error: "Too many files. Maximum 5 images per scan.", code: "TOO_MANY_FILES" });
  }
  if (err && (err.code === "LIMIT_UNEXPECTED_FILE" || /Only image files allowed/.test(err.message || ""))) {
    return res.status(400).json({ error: "Invalid image. Accepted formats: JPG, JPEG, PNG, WEBP.", code: "INVALID_IMAGE" });
  }
  const status = err && err.status ? err.status : 500;
  const message = status >= 500
    ? "Something went wrong on our side. Please try again."
    : (err && err.message) || "Request failed.";
  if (status >= 500) console.error(`[${new Date().toISOString()}]`, err);
  res.status(status).json({ error: message, code: (err && err.code) || (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED") });
}

function notFoundMiddleware(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}`, code: "NOT_FOUND" });
}

module.exports = { ApiError, asyncHandler, errorMiddleware, notFoundMiddleware };
