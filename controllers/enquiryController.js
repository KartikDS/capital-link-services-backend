const crypto = require('crypto');
const { dbRun, dbGet, dbAll } = require('../config/db');

// Submit Inquiry
const submitEnquiry = async (req, res, next) => {
  try {
    const { fullName, email, phone, serviceCategory, subject, message, preferredContactMethod } = req.body;

    if (!fullName || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, subject, and message are required'
      });
    }

    const id = 'enq-' + crypto.randomUUID();
    const now = new Date().toISOString();

    await dbRun(
      `INSERT INTO enquiries (
        id, fullName, email, phone, serviceCategory, subject, message, preferredContactMethod, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        fullName.trim(),
        email.toLowerCase().trim(),
        phone ? phone.trim() : '',
        serviceCategory || 'general',
        subject.trim(),
        message.trim(),
        preferredContactMethod || 'email',
        'new',
        now,
        now
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Thank you for contacting Capital Link Services. Your inquiry has been received and our team will get back to you shortly.',
      enquiry: {
        id,
        fullName,
        email,
        phone: phone || '',
        serviceCategory: serviceCategory || 'general',
        subject,
        message,
        preferredContactMethod: preferredContactMethod || 'email',
        status: 'new',
        createdAt: now
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get All Enquiries (Admin only)
const getAllEnquiries = async (req, res, next) => {
  try {
    const { status, serviceCategory } = req.query;
    let sql = 'SELECT * FROM enquiries WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (serviceCategory) {
      sql += ' AND serviceCategory = ?';
      params.push(serviceCategory);
    }

    sql += ' ORDER BY createdAt DESC';

    const enquiries = await dbAll(sql, params);
    res.json({ success: true, count: enquiries.length, enquiries });
  } catch (error) {
    next(error);
  }
};

// Update Enquiry Status (Admin only)
const updateEnquiryStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['new', 'in_progress', 'resolved'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const enquiry = await dbGet('SELECT * FROM enquiries WHERE id = ?', [id]);
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }

    const now = new Date().toISOString();
    await dbRun('UPDATE enquiries SET status = ?, updatedAt = ? WHERE id = ?', [status, now, id]);

    res.json({
      success: true,
      message: `Enquiry status updated to ${status}`,
      id,
      status,
      updatedAt: now
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitEnquiry,
  getAllEnquiries,
  updateEnquiryStatus
};
