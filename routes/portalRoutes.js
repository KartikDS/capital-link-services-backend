const express = require('express');
const router = express.Router();
const portalController = require('../controllers/portalController');
const { optionalAuthToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Dashboard summary
router.get('/dashboard', optionalAuthToken, portalController.getDashboardSummary);

// Orders history
router.get('/orders', optionalAuthToken, portalController.getPortalOrders);

// Documents
router.get('/documents', optionalAuthToken, portalController.getPortalDocuments);
router.post(
  '/documents',
  optionalAuthToken,
  upload.single('file'),
  portalController.uploadPortalDocument
);

// Passport Photos
router.get('/passport-photos', optionalAuthToken, portalController.getPassportPhotos);
router.post(
  '/passport-photos',
  optionalAuthToken,
  upload.single('photo'),
  portalController.uploadPassportPhoto
);

// Profile & Details
router.get('/profile', optionalAuthToken, portalController.getProfile);
router.put('/profile', optionalAuthToken, portalController.updateProfile);

// Invoices
router.get('/invoices', optionalAuthToken, portalController.getInvoices);

module.exports = router;
