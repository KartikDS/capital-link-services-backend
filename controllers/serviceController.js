const crypto = require('crypto');
const { dbRun } = require('../config/db');

// Helper to generate reference number e.g., CLS-LEG-2026-98124
const generateReferenceNumber = (prefix) => {
  const randomDigits = Math.floor(10000 + Math.random() * 90000);
  const year = new Date().getFullYear();
  return `CLS-${prefix}-${year}-${randomDigits}`;
};

// Fee calculation for Russian Visa Voucher
const calculateRussianVoucherFee = (voucherType, entryType, turnaroundTime) => {
  let base = voucherType === 'Business Invitation' ? 250 : 120;
  if (entryType === 'Double Entry') base += 50;
  if (entryType === 'Multiple Entry') base += 120;

  if (turnaroundTime === 'Express') base += 60;
  if (turnaroundTime === 'Urgent') base += 120;

  return base;
};

// 1. Submit Document Legalisation
const submitDocumentLegalisation = async (req, res, next) => {
  try {
    const { fullName, email, phone, country, documentTypes, issuingState, documentCount, notes } =
      req.body;

    if (!fullName || !email || !phone || !documentTypes || !issuingState) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, phone, document types, and issuing state are required'
      });
    }

    const id = 'leg-' + crypto.randomUUID();
    const referenceNumber = generateReferenceNumber('LEG');
    const userId = req.user ? req.user.id : null;
    const now = new Date().toISOString();

    const filePaths = req.files ? req.files.map((f) => f.path) : [];
    const docTypesStr = Array.isArray(documentTypes)
      ? JSON.stringify(documentTypes)
      : documentTypes;

    await dbRun(
      `INSERT INTO service_document_legalisation (
        id, referenceNumber, userId, fullName, email, phone, country, documentTypes, issuingState, documentCount, notes, filePaths, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        referenceNumber,
        userId,
        fullName.trim(),
        email.toLowerCase().trim(),
        phone.trim(),
        country || 'AUS',
        docTypesStr,
        issuingState,
        parseInt(documentCount, 10) || 1,
        notes || '',
        JSON.stringify(filePaths),
        'submitted',
        now,
        now
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Document Legalisation application submitted successfully',
      application: {
        id,
        referenceNumber,
        fullName,
        email,
        phone,
        country: country || 'AUS',
        documentTypes: docTypesStr,
        issuingState,
        documentCount: parseInt(documentCount, 10) || 1,
        notes: notes || '',
        fileCount: filePaths.length,
        status: 'submitted',
        createdAt: now
      }
    });
  } catch (error) {
    next(error);
  }
};

// 2. Submit Police Clearance
const submitPoliceClearance = async (req, res, next) => {
  try {
    const { fullName, email, phone, dateOfBirth, gender, passportNumber, country, purpose } =
      req.body;

    if (!fullName || !email || !phone || !dateOfBirth || !passportNumber || !purpose) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, phone, date of birth, passport number, and purpose are required'
      });
    }

    const id = 'pol-' + crypto.randomUUID();
    const referenceNumber = generateReferenceNumber('POL');
    const userId = req.user ? req.user.id : null;
    const now = new Date().toISOString();

    const filePaths = req.files ? req.files.map((f) => f.path) : [];

    await dbRun(
      `INSERT INTO service_police_clearance (
        id, referenceNumber, userId, fullName, email, phone, dateOfBirth, gender, passportNumber, country, purpose, identityDocPaths, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        referenceNumber,
        userId,
        fullName.trim(),
        email.toLowerCase().trim(),
        phone.trim(),
        dateOfBirth,
        gender || 'unspecified',
        passportNumber.trim(),
        country || 'AUS',
        purpose,
        JSON.stringify(filePaths),
        'submitted',
        now,
        now
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Police Clearance application submitted successfully',
      application: {
        id,
        referenceNumber,
        fullName,
        email,
        phone,
        dateOfBirth,
        passportNumber,
        purpose,
        country: country || 'AUS',
        fileCount: filePaths.length,
        status: 'submitted',
        createdAt: now
      }
    });
  } catch (error) {
    next(error);
  }
};

// 3. Submit Russian Visa Voucher
const submitRussianVisaVoucher = async (req, res, next) => {
  try {
    const {
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
      turnaroundTime
    } = req.body;

    if (
      !voucherType ||
      !entryType ||
      !fullName ||
      !passportNumber ||
      !nationality ||
      !email ||
      !phone ||
      !arrivalDate ||
      !departureDate
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Voucher type, entry type, full name, passport number, nationality, email, phone, arrival date, and departure date are required'
      });
    }

    const id = 'rvv-' + crypto.randomUUID();
    const referenceNumber = generateReferenceNumber('RVV');
    const userId = req.user ? req.user.id : null;
    const now = new Date().toISOString();

    const selectedTurnaround = turnaroundTime || 'Standard';
    const estimatedFee = calculateRussianVoucherFee(voucherType, entryType, selectedTurnaround);
    const citiesStr = Array.isArray(citiesToVisit)
      ? JSON.stringify(citiesToVisit)
      : citiesToVisit || '';

    await dbRun(
      `INSERT INTO service_russian_visa_voucher (
        id, referenceNumber, userId, voucherType, entryType, fullName, passportNumber, nationality, email, phone, arrivalDate, departureDate, citiesToVisit, accommodationDetails, turnaroundTime, estimatedFee, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        referenceNumber,
        userId,
        voucherType,
        entryType,
        fullName.trim(),
        passportNumber.trim(),
        nationality.trim(),
        email.toLowerCase().trim(),
        phone.trim(),
        arrivalDate,
        departureDate,
        citiesStr,
        accommodationDetails || '',
        selectedTurnaround,
        estimatedFee,
        'consultant_review',
        now,
        now
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Russian Visa Voucher application submitted successfully',
      application: {
        id,
        referenceNumber,
        voucherType,
        entryType,
        fullName,
        passportNumber,
        nationality,
        email,
        phone,
        arrivalDate,
        departureDate,
        citiesToVisit: citiesStr,
        accommodationDetails: accommodationDetails || '',
        turnaroundTime: selectedTurnaround,
        estimatedFee,
        feeCurrency: 'AUD',
        status: 'consultant_review',
        createdAt: now
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitDocumentLegalisation,
  submitPoliceClearance,
  submitRussianVisaVoucher
};
