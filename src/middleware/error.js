function errorHandler(err, req, res, next) {
  console.error('Unhandled Server Error:', err);

  const status = err.status || 500;
  const message = err.message || 'Internal server error occurred.';

  res.status(status).json({
    success: false,
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  errorHandler,
};
