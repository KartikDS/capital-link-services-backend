const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { optionalAuthToken, authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Track order
router.get('/track/:referenceNumber', orderController.trackOrder);
router.post('/track', orderController.trackOrderPost);

// Russian Visa Voucher Order
router.post(
  '/russian-visa-voucher',
  optionalAuthToken,
  upload.single('passportCopy'),
  orderController.createRussianVisaVoucherOrder
);
router.get(
  '/russian-visa-voucher',
  optionalAuthToken,
  orderController.createRussianVisaVoucherOrder
);

// Document Attestation Order
router.post(
  '/attestation',
  optionalAuthToken,
  upload.array('documents', 5),
  orderController.createAttestationOrder
);
router.get('/attestation', optionalAuthToken, orderController.createAttestationOrder);
router.post(
  '/document-attestation',
  optionalAuthToken,
  upload.array('documents', 5),
  orderController.createAttestationOrder
);

// Police Clearance Order
router.post(
  '/police-clearance',
  optionalAuthToken,
  upload.array('identityDocs', 5),
  orderController.createPoliceClearanceOrder
);
router.get('/police-clearance', optionalAuthToken, orderController.createPoliceClearanceOrder);

// Checkout endpoint
router.post('/checkout', optionalAuthToken, orderController.checkoutOrder);

// Authenticated user application history
router.get('/my-applications', authenticateToken, orderController.getMyApplications);

// Admin status update
router.patch(
  '/:referenceNumber/status',
  authenticateToken,
  requireRole('admin'),
  orderController.updateOrderStatus
);

module.exports = router;
