const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { optionalAuthToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Document Legalisation (Supports file attachments)
router.post(
  '/document-legalisation',
  optionalAuthToken,
  upload.array('documents', 5),
  serviceController.submitDocumentLegalisation
);

// Police Clearance (Supports ID document attachments)
router.post(
  '/police-clearance',
  optionalAuthToken,
  upload.array('identityDocs', 5),
  serviceController.submitPoliceClearance
);

// Russian Visa Voucher (As per russian-visa-voucher portal)
router.post(
  '/russian-visa-voucher',
  optionalAuthToken,
  serviceController.submitRussianVisaVoucher
);

module.exports = router;
