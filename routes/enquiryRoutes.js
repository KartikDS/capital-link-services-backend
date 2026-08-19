const express = require('express');
const router = express.Router();
const enquiryController = require('../controllers/enquiryController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Public contact form submission
router.post('/', enquiryController.submitEnquiry);

// Admin endpoints
router.get('/', authenticateToken, requireRole('admin'), enquiryController.getAllEnquiries);
router.patch('/:id/status', authenticateToken, requireRole('admin'), enquiryController.updateEnquiryStatus);

module.exports = router;
