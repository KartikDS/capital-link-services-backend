const errorHandler = (err, req, res, next) => {
  console.error('Error Trace:', err.stack || err.message);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message });
  }

  if (err.message && err.message.includes('file type')) {
    return res.status(400).json({ success: false, message: err.message });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
};

module.exports = errorHandler;
