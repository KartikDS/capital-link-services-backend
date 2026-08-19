const db = require('../config/db');
const path = require('path');

// Track Order by Reference Number (GET /api/orders/track/:referenceNumber)
const trackOrder = async (req, res, next) => {
  try {
    const { referenceNumber } = req.params;

    if (!referenceNumber) {
      return res.status(400).json({ success: false, message: 'Reference number is required' });
    }

    const ref = referenceNumber.trim().toUpperCase();

    let order = null;
    let serviceType = '';

    if (ref.startsWith('CLS-LEG-')) {
      order = await db.dbGet(
        'SELECT * FROM service_document_legalisation WHERE UPPER(referenceNumber) = ?',
        [ref]
      );
      serviceType = 'Document Legalisation';
    } else if (ref.startsWith('CLS-POL-')) {
      order = await db.dbGet(
        'SELECT * FROM service_police_clearance WHERE UPPER(referenceNumber) = ?',
        [ref]
      );
      serviceType = 'Police Clearance';
    } else if (ref.startsWith('CLS-RVV-')) {
      order = await db.dbGet(
        'SELECT * FROM service_russian_visa_voucher WHERE UPPER(referenceNumber) = ?',
        [ref]
      );
      serviceType = 'Russian Visa Voucher';
    } else {
      order = await db.dbGet(
        'SELECT * FROM service_document_legalisation WHERE UPPER(referenceNumber) = ?',
        [ref]
      );
      if (order) serviceType = 'Document Legalisation';

      if (!order) {
        order = await db.dbGet(
          'SELECT * FROM service_police_clearance WHERE UPPER(referenceNumber) = ?',
          [ref]
        );
        if (order) serviceType = 'Police Clearance';
      }

      if (!order) {
        order = await db.dbGet(
          'SELECT * FROM service_russian_visa_voucher WHERE UPPER(referenceNumber) = ?',
          [ref]
        );
        if (order) serviceType = 'Russian Visa Voucher';
      }
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `No application found with reference number: ${referenceNumber}`
      });
    }

    res.json({
      success: true,
      serviceType,
      order: {
        referenceNumber: order.referenceNumber,
        fullName: order.fullName,
        email: order.email,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        details: {
          issuingState: order.issuingState,
          documentCount: order.documentCount,
          purpose: order.purpose,
          voucherType: order.voucherType,
          entryType: order.entryType,
          arrivalDate: order.arrivalDate,
          departureDate: order.departureDate,
          estimatedFee: order.estimatedFee
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Track Order via POST /api/orders/track body { reference, email }
const trackOrderPost = async (req, res, next) => {
  try {
    const { reference, email } = req.body;
    if (!reference) {
      return res
        .status(400)
        .json({ success: false, error: 'Enter your CLS order reference and email address.' });
    }

    const ref = String(reference).trim().toUpperCase();
    let order = null;
    let serviceType = '';

    if (ref.startsWith('CLS-LEG-')) {
      order = await db.dbGet(
        'SELECT * FROM service_document_legalisation WHERE UPPER(referenceNumber) = ?',
        [ref]
      );
      serviceType = 'Document Legalisation';
    } else if (ref.startsWith('CLS-POL-')) {
      order = await db.dbGet(
        'SELECT * FROM service_police_clearance WHERE UPPER(referenceNumber) = ?',
        [ref]
      );
      serviceType = 'Police Clearance';
    } else if (ref.startsWith('CLS-RVV-')) {
      order = await db.dbGet(
        'SELECT * FROM service_russian_visa_voucher WHERE UPPER(referenceNumber) = ?',
        [ref]
      );
      serviceType = 'Russian Visa Voucher';
    } else {
      order = await db.dbGet(
        'SELECT * FROM service_document_legalisation WHERE UPPER(referenceNumber) = ?',
        [ref]
      );
      if (order) serviceType = 'Document Legalisation';
      if (!order) {
        order = await db.dbGet(
          'SELECT * FROM service_police_clearance WHERE UPPER(referenceNumber) = ?',
          [ref]
        );
        if (order) serviceType = 'Police Clearance';
      }
      if (!order) {
        order = await db.dbGet(
          'SELECT * FROM service_russian_visa_voucher WHERE UPPER(referenceNumber) = ?',
          [ref]
        );
        if (order) serviceType = 'Russian Visa Voucher';
      }
    }

    if (!order || (email && order.email.toLowerCase() !== String(email).trim().toLowerCase())) {
      return res.status(404).json({
        success: false,
        error: 'We could not find an order with that reference and email address.'
      });
    }

    res.json({
      success: true,
      order: {
        reference: order.referenceNumber,
        service: serviceType,
        status: order.status || 'submitted',
        fullName: order.fullName,
        email: order.email,
        createdAt: order.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

// Create Russian Visa Voucher Order (POST /api/orders/russian-visa-voucher)
const createRussianVisaVoucherOrder = async (req, res, next) => {
  try {
    const query = req.query || {};
    const body = req.body || {};

    const voucherType = body.voucherType || query.type || body.type || 'tourist';
    const entryType = body.entryType || query.entry || body.entry || 'single';

    const fullName =
      body.fullName ||
      (body.applicant
        ? `${body.applicant.firstName || ''} ${body.applicant.lastName || ''}`.trim()
        : '') ||
      'Applicant';
    const email = body.email || (body.applicant ? body.applicant.email : '') || '';
    const phone = body.phone || (body.applicant ? body.applicant.phone : '') || '';
    const passportNumber =
      body.passportNumber ||
      (body.applicant ? body.applicant.passportNumber : '') ||
      'NOT_PROVIDED';
    const nationality =
      body.nationality || (body.applicant ? body.applicant.nationality : '') || 'Australian';

    const arrivalDate =
      body.arrivalDate ||
      (body.travel ? body.travel.arrivalDate : '') ||
      new Date().toISOString().split('T')[0];
    const departureDate =
      body.departureDate ||
      (body.travel ? body.travel.departureDate : '') ||
      new Date().toISOString().split('T')[0];
    const citiesToVisit =
      body.citiesToVisit ||
      (body.travel ? body.travel.citiesToVisit : '') ||
      'Moscow, Saint Petersburg';
    const accommodationDetails =
      body.accommodationDetails || (body.travel ? body.travel.hotelDetails : '') || '';

    const turnaroundTime = body.turnaroundTime || body.processingSpeed || 'Standard';
    const estimatedFee = parseFloat(body.estimatedFee || body.fee || 150.0);

    const userId = req.user ? req.user.id : null;
    const id = `RVV-${Date.now()}`;
    const referenceNumber = `CLS-RVV-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date().toISOString();

    await db.dbRun(
      `
      INSERT INTO service_russian_visa_voucher (
        id, referenceNumber, userId, voucherType, entryType, fullName, passportNumber, nationality,
        email, phone, arrivalDate, departureDate, citiesToVisit, accommodationDetails, turnaroundTime,
        estimatedFee, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        id,
        referenceNumber,
        userId,
        voucherType,
        entryType,
        fullName,
        passportNumber,
        nationality,
        email,
        phone,
        arrivalDate,
        departureDate,
        citiesToVisit,
        accommodationDetails,
        turnaroundTime,
        estimatedFee,
        'submitted',
        now,
        now
      ]
    );

    // Handle passport file upload if attached
    let fileInfo = null;
    if (req.file) {
      const docId = `DOC-${Date.now()}`;
      await db.dbRun(
        `
        INSERT INTO portal_documents (
          id, userId, email, reference, name, state, meta, filePath, originalName, fileSizeBytes, mimeType, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          docId,
          userId,
          email,
          referenceNumber,
          'Passport Copy',
          'received',
          `PDF · ${(req.file.size / 1024 / 1024).toFixed(1)} MB`,
          req.file.path,
          req.file.originalname,
          req.file.size,
          req.file.mimetype,
          now,
          now
        ]
      );
      fileInfo = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: `/uploads/passports/${path.basename(req.file.path)}`
      };
    }

    res.status(201).json({
      success: true,
      ok: true,
      message: 'Russian visa voucher application submitted successfully.',
      referenceNumber,
      order: {
        id,
        referenceNumber,
        voucherType,
        entryType,
        fullName,
        email,
        phone,
        passportNumber,
        nationality,
        arrivalDate,
        departureDate,
        citiesToVisit,
        estimatedFee,
        status: 'submitted',
        createdAt: now,
        passportFile: fileInfo
      }
    });
  } catch (error) {
    next(error);
  }
};

// Create Document Legalisation / Attestation Order (POST /api/orders/attestation)
const createAttestationOrder = async (req, res, next) => {
  try {
    const query = req.query || {};
    const body = req.body || {};

    const documentCategory = body.type || query.type || body.category || 'personal';
    const destinationCountry = body.destination || query.destination || 'united-arab-emirates';
    const originCountry = body.origin || query.origin || 'australia';

    const fullName = body.fullName || (body.contact ? body.contact.name : '') || 'Client';
    const email = body.email || (body.contact ? body.contact.email : '') || '';
    const phone = body.phone || (body.contact ? body.contact.phone : '') || '';
    const issuingState = body.issuingState || body.state || 'ACT';
    const documentTypes = Array.isArray(body.documentTypes)
      ? body.documentTypes.join(', ')
      : body.documentTypes || 'General Document Legalisation';
    const documentCount = parseInt(body.documentCount || body.count || 1, 10);
    const notes = body.notes || (body.services ? JSON.stringify(body.services) : '');

    const userId = req.user ? req.user.id : null;
    const id = `LEG-${Date.now()}`;
    const referenceNumber = `CLS-LEG-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date().toISOString();

    let uploadedFiles = [];
    if (req.files && Array.isArray(req.files)) {
      uploadedFiles = req.files.map((f) => f.path);
      for (const f of req.files) {
        const docId = `DOC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        await db.dbRun(
          `
          INSERT INTO portal_documents (
            id, userId, email, reference, name, state, meta, filePath, originalName, fileSizeBytes, mimeType, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            docId,
            userId,
            email,
            referenceNumber,
            f.originalname,
            'received',
            `FILE · ${(f.size / 1024 / 1024).toFixed(1)} MB`,
            f.path,
            f.originalname,
            f.size,
            f.mimetype,
            now,
            now
          ]
        );
      }
    }

    await db.dbRun(
      `
      INSERT INTO service_document_legalisation (
        id, referenceNumber, userId, fullName, email, phone, country, documentTypes, issuingState,
        documentCount, notes, filePaths, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        id,
        referenceNumber,
        userId,
        fullName,
        email,
        phone,
        destinationCountry,
        documentTypes,
        issuingState,
        documentCount,
        notes,
        JSON.stringify(uploadedFiles),
        'submitted',
        now,
        now
      ]
    );

    res.status(201).json({
      success: true,
      ok: true,
      message: 'Document attestation application submitted successfully.',
      referenceNumber,
      order: {
        id,
        referenceNumber,
        fullName,
        email,
        phone,
        destinationCountry,
        originCountry,
        documentCategory,
        documentTypes,
        issuingState,
        documentCount,
        status: 'submitted',
        createdAt: now
      }
    });
  } catch (error) {
    next(error);
  }
};

// Create Police Clearance Order (POST /api/orders/police-clearance)
const createPoliceClearanceOrder = async (req, res, next) => {
  try {
    const query = req.query || {};
    const body = req.body || {};

    const nationality = body.nationality || query.nationality || 'afghanistan';
    const clearanceType =
      body.clearanceType || query.type || body.type || 'afp-national-police-check';

    const applicant =
      Array.isArray(body.applicants) && body.applicants[0] ? body.applicants[0] : body;
    const fullName =
      body.fullName ||
      `${applicant.firstName || ''} ${applicant.lastName || ''}`.trim() ||
      'Applicant';
    const email = body.email || applicant.email || '';
    const phone = body.phone || applicant.phone || '';
    const dateOfBirth = body.dateOfBirth || applicant.dateOfBirth || '1990-01-01';
    const gender = body.gender || applicant.gender || 'unspecified';
    const passportNumber = body.passportNumber || applicant.passportNumber || 'NOT_PROVIDED';
    const country = body.country || applicant.country || 'Australia';
    const purpose = body.purpose || body.purposeId || clearanceType;

    const userId = req.user ? req.user.id : null;
    const id = `POL-${Date.now()}`;
    const referenceNumber = `CLS-POL-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date().toISOString();

    let uploadedFiles = [];
    if (req.files && Array.isArray(req.files)) {
      uploadedFiles = req.files.map((f) => f.path);
    }

    await db.dbRun(
      `
      INSERT INTO service_police_clearance (
        id, referenceNumber, userId, fullName, email, phone, dateOfBirth, gender, passportNumber,
        country, purpose, identityDocPaths, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        id,
        referenceNumber,
        userId,
        fullName,
        email,
        phone,
        dateOfBirth,
        gender,
        passportNumber,
        country,
        purpose,
        JSON.stringify(uploadedFiles),
        'submitted',
        now,
        now
      ]
    );

    res.status(201).json({
      success: true,
      ok: true,
      message: 'Police clearance application submitted successfully.',
      referenceNumber,
      order: {
        id,
        referenceNumber,
        fullName,
        email,
        phone,
        nationality,
        clearanceType,
        purpose,
        status: 'submitted',
        createdAt: now
      }
    });
  } catch (error) {
    next(error);
  }
};

// Checkout Unified Order Handler (POST /api/orders/checkout)
const checkoutOrder = async (req, res, next) => {
  try {
    const { service, spec, email } = req.body;

    if (!service) {
      return res.status(400).json({ success: false, error: 'Unknown service.' });
    }

    const now = new Date().toISOString();

    if (service === 'russian-visa-voucher') {
      const ref = `CLS-RVV-${Math.floor(100000 + Math.random() * 900000)}`;
      const id = `RVV-${Date.now()}`;
      await db.dbRun(
        `
        INSERT INTO service_russian_visa_voucher (
          id, referenceNumber, userId, voucherType, entryType, fullName, passportNumber, nationality,
          email, phone, arrivalDate, departureDate, citiesToVisit, accommodationDetails, turnaroundTime,
          estimatedFee, status, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          id,
          ref,
          req.user?.id || null,
          spec?.planId || 'tourist',
          'single',
          spec?.fullName || 'Valued Client',
          spec?.passportNumber || 'SPECIFIED',
          'Australian',
          email || 'client@example.com',
          '',
          now.split('T')[0],
          now.split('T')[0],
          'Moscow',
          '',
          'Standard',
          150.0,
          'submitted',
          now,
          now
        ]
      );

      return res.json({
        success: true,
        referenceNumber: ref,
        url: `/payment/success?session_id=${ref}`
      });
    }

    if (service === 'police-clearance') {
      const ref = `CLS-POL-${Math.floor(100000 + Math.random() * 900000)}`;
      const id = `POL-${Date.now()}`;
      await db.dbRun(
        `
        INSERT INTO service_police_clearance (
          id, referenceNumber, userId, fullName, email, phone, dateOfBirth, gender, passportNumber,
          country, purpose, identityDocPaths, status, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          id,
          ref,
          req.user?.id || null,
          'Applicant',
          email || 'client@example.com',
          '',
          '1990-01-01',
          'unspecified',
          'SPECIFIED',
          'Australia',
          spec?.clearanceId || 'AFP Check',
          '[]',
          'submitted',
          now,
          now
        ]
      );

      return res.json({
        success: true,
        referenceNumber: ref,
        url: `/payment/success?session_id=${ref}`
      });
    }

    res.status(400).json({ success: false, error: 'Unsupported order service.' });
  } catch (error) {
    next(error);
  }
};

// Get My Applications (Authenticated user)
const getMyApplications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    const legList = await db.dbAll(
      'SELECT * FROM service_document_legalisation WHERE userId = ? OR email = ? ORDER BY createdAt DESC',
      [userId, userEmail]
    );
    const polList = await db.dbAll(
      'SELECT * FROM service_police_clearance WHERE userId = ? OR email = ? ORDER BY createdAt DESC',
      [userId, userEmail]
    );
    const rvvList = await db.dbAll(
      'SELECT * FROM service_russian_visa_voucher WHERE userId = ? OR email = ? ORDER BY createdAt DESC',
      [userId, userEmail]
    );

    const formattedLeg = legList.map((item) => ({ ...item, serviceType: 'Document Legalisation' }));
    const formattedPol = polList.map((item) => ({ ...item, serviceType: 'Police Clearance' }));
    const formattedRvv = rvvList.map((item) => ({ ...item, serviceType: 'Russian Visa Voucher' }));

    const allApplications = [...formattedLeg, ...formattedPol, ...formattedRvv].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({
      success: true,
      count: allApplications.length,
      applications: allApplications
    });
  } catch (error) {
    next(error);
  }
};

// Update Order Status (Admin)
const updateOrderStatus = async (req, res, next) => {
  try {
    const { referenceNumber } = req.params;
    const { status } = req.body;

    if (!referenceNumber || !status) {
      return res
        .status(400)
        .json({ success: false, message: 'Reference number and new status are required' });
    }

    const ref = referenceNumber.trim().toUpperCase();
    const now = new Date().toISOString();
    let updated = false;

    if (ref.startsWith('CLS-LEG-')) {
      const resDb = await db.dbRun(
        'UPDATE service_document_legalisation SET status = ?, updatedAt = ? WHERE UPPER(referenceNumber) = ?',
        [status, now, ref]
      );
      if (resDb.changes > 0) updated = true;
    } else if (ref.startsWith('CLS-POL-')) {
      const resDb = await db.dbRun(
        'UPDATE service_police_clearance SET status = ?, updatedAt = ? WHERE UPPER(referenceNumber) = ?',
        [status, now, ref]
      );
      if (resDb.changes > 0) updated = true;
    } else if (ref.startsWith('CLS-RVV-')) {
      const resDb = await db.dbRun(
        'UPDATE service_russian_visa_voucher SET status = ?, updatedAt = ? WHERE UPPER(referenceNumber) = ?',
        [status, now, ref]
      );
      if (resDb.changes > 0) updated = true;
    }

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Order reference not found' });
    }

    res.json({
      success: true,
      message: `Order ${ref} status updated to ${status}`,
      referenceNumber: ref,
      status,
      updatedAt: now
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  trackOrder,
  trackOrderPost,
  createRussianVisaVoucherOrder,
  createAttestationOrder,
  createPoliceClearanceOrder,
  checkoutOrder,
  getMyApplications,
  updateOrderStatus
};
