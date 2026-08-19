const { dbGet, dbAll, dbRun } = require('../config/db');
const path = require('path');

// Helper to format date strings for display
const formatDate = (isoString) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return isoString;
  }
};

// Map DB status to PortalOrderStage & Progress
const mapStageAndProgress = (status) => {
  const s = (status || 'submitted').toLowerCase();
  if (s === 'action-required' || s === 'action_required' || s === 'pending_documents') {
    return { stage: 'action-required', progress: 25, milestone: 'Action required from client' };
  }
  if (s === 'submitted' || s === 'new' || s === 'received') {
    return {
      stage: 'in-progress',
      progress: 40,
      milestone: 'Document under review by CLS consultant'
    };
  }
  if (s === 'processing' || s === 'embassy' || s === 'dfat') {
    return {
      stage: 'in-progress',
      progress: 70,
      milestone: 'Processing at government / embassy authority'
    };
  }
  if (s === 'ready' || s === 'ready_for_collection') {
    return { stage: 'ready', progress: 90, milestone: 'Ready for collection / courier dispatch' };
  }
  if (s === 'completed' || s === 'delivered' || s === 'issued') {
    return { stage: 'completed', progress: 100, milestone: 'Completed and delivered' };
  }
  return { stage: 'in-progress', progress: 50, milestone: 'In progress' };
};

// GET /api/portal/dashboard
const getDashboardSummary = async (req, res, next) => {
  try {
    const userId = req.user?.id || '';
    const userEmail = req.user?.email || '';

    // Fetch user profile
    const user = await dbGet('SELECT * FROM users WHERE id = ? OR email = ?', [userId, userEmail]);
    const profile = await dbGet('SELECT * FROM portal_profiles WHERE userId = ? OR email = ?', [
      userId,
      userEmail
    ]);

    // Fetch orders across tables
    const legOrders = await dbAll(
      'SELECT * FROM service_document_legalisation WHERE userId = ? OR email = ? ORDER BY createdAt DESC',
      [userId, userEmail]
    );
    const polOrders = await dbAll(
      'SELECT * FROM service_police_clearance WHERE userId = ? OR email = ? ORDER BY createdAt DESC',
      [userId, userEmail]
    );
    const rvvOrders = await dbAll(
      'SELECT * FROM service_russian_visa_voucher WHERE userId = ? OR email = ? ORDER BY createdAt DESC',
      [userId, userEmail]
    );

    // Format orders
    const allOrders = [
      ...legOrders.map((item) => {
        const { stage, progress, milestone } = mapStageAndProgress(item.status);
        return {
          reference: item.referenceNumber,
          service: 'Document Legalisation',
          detail: `${item.documentCount || 1} document(s) · ${item.issuingState || 'Australia'}`,
          stage,
          progress,
          milestone,
          updated: formatDate(item.updatedAt),
          eta: null,
          amountCents: 0,
          applicant: item.fullName,
          destination: item.country || 'Australia',
          transactionId: item.referenceNumber,
          submittedAt: item.createdAt,
          departureDate: null
        };
      }),
      ...polOrders.map((item) => {
        const { stage, progress, milestone } = mapStageAndProgress(item.status);
        return {
          reference: item.referenceNumber,
          service: 'Police Clearance',
          detail: `1 applicant · ${item.purpose || 'National Police Check'}`,
          stage,
          progress,
          milestone,
          updated: formatDate(item.updatedAt),
          eta: null,
          amountCents: 22000,
          applicant: item.fullName,
          destination: item.country || 'Australia',
          transactionId: item.referenceNumber,
          submittedAt: item.createdAt,
          departureDate: null
        };
      }),
      ...rvvOrders.map((item) => {
        const { stage, progress, milestone } = mapStageAndProgress(item.status);
        return {
          reference: item.referenceNumber,
          service: 'Russian Visa Voucher',
          detail: `${item.voucherType || 'Tourist'} · ${item.entryType || 'Single entry'}`,
          stage,
          progress,
          milestone,
          updated: formatDate(item.updatedAt),
          eta: formatDate(item.departureDate),
          amountCents: Math.round((item.estimatedFee || 150) * 100),
          applicant: item.fullName,
          destination: 'Russian Federation',
          transactionId: item.referenceNumber,
          submittedAt: item.createdAt,
          departureDate: item.departureDate
        };
      })
    ].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    // Stats calculation
    const activeOrders = allOrders.filter((o) => o.stage !== 'completed');
    const actionRequiredCount = allOrders.filter((o) => o.stage === 'action-required').length;

    // Documents
    const docs = await dbAll(
      'SELECT * FROM portal_documents WHERE userId = ? OR email = ? ORDER BY createdAt DESC',
      [userId, userEmail]
    );
    const readyDocsCount = docs.filter((d) => d.state === 'ready').length;

    // Invoices
    const invoices = await dbAll(
      'SELECT * FROM portal_invoices WHERE userId = ? OR email = ? ORDER BY createdAt DESC',
      [userId, userEmail]
    );
    const dueInvoices = invoices.filter((inv) => inv.state === 'due' || inv.state === 'overdue');
    const outstandingCents = dueInvoices.reduce((sum, inv) => sum + (inv.amountCents || 0), 0);

    const stats = [
      {
        id: 'active-orders',
        label: 'Active orders',
        value: activeOrders.length,
        hint:
          activeOrders.length === 1
            ? '1 application in progress'
            : `${activeOrders.length} applications in progress`,
        tone: 'sky'
      },
      {
        id: 'action-required',
        label: 'Action required',
        value: actionRequiredCount,
        hint:
          actionRequiredCount === 0
            ? 'Everything is moving'
            : `${actionRequiredCount} item needs attention`,
        tone: actionRequiredCount > 0 ? 'alert' : 'navy'
      },
      {
        id: 'ready-docs',
        label: 'Documents ready',
        value: readyDocsCount,
        hint: readyDocsCount === 1 ? '1 ready to download' : `${readyDocsCount} ready to download`,
        tone: 'done'
      },
      {
        id: 'completed-jobs',
        label: 'Completed jobs',
        value: allOrders.filter((o) => o.stage === 'completed').length,
        hint: 'Past successful lodgements',
        tone: 'navy'
      }
    ];

    res.json({
      success: true,
      user: {
        firstName: user?.fullName ? user.fullName.split(' ')[0] : req.user?.firstName || 'Client',
        fullName: user?.fullName || 'Client User',
        initials: user?.fullName
          ? user.fullName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
          : 'CU',
        email: userEmail,
        company: profile?.company || ''
      },
      stats,
      outstandingCents,
      activeOrders: activeOrders.slice(0, 5),
      documents: docs.slice(0, 5),
      notices: [
        {
          id: 'notice-1',
          title: 'DFAT Apostille turnarounds update',
          body: 'DFAT Canberra processing time standard is currently 3 to 5 business days for standard legalisations.',
          posted: 'Updated 2 days ago'
        },
        {
          id: 'notice-2',
          title: 'UAE Embassy Attestation Guidelines',
          body: 'Original educational documents require prior Department of Foreign Affairs verification before embassy stamping.',
          posted: 'Updated 1 week ago'
        }
      ]
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/portal/orders
const getPortalOrders = async (req, res, next) => {
  try {
    const userId = req.user?.id || '';
    const userEmail = req.user?.email || '';
    const { stage, search } = req.query;

    const legOrders = await dbAll(
      'SELECT * FROM service_document_legalisation WHERE userId = ? OR email = ?',
      [userId, userEmail]
    );
    const polOrders = await dbAll(
      'SELECT * FROM service_police_clearance WHERE userId = ? OR email = ?',
      [userId, userEmail]
    );
    const rvvOrders = await dbAll(
      'SELECT * FROM service_russian_visa_voucher WHERE userId = ? OR email = ?',
      [userId, userEmail]
    );

    let allOrders = [
      ...legOrders.map((item) => {
        const { stage: stg, progress, milestone } = mapStageAndProgress(item.status);
        return {
          reference: item.referenceNumber,
          service: 'Document Legalisation',
          detail: `${item.documentCount || 1} document(s) · ${item.issuingState || 'Australia'}`,
          stage: stg,
          progress,
          milestone,
          updated: formatDate(item.updatedAt),
          eta: null,
          amountCents: 0,
          applicant: item.fullName,
          destination: item.country || 'Australia',
          transactionId: item.referenceNumber,
          submittedAt: item.createdAt,
          departureDate: null
        };
      }),
      ...polOrders.map((item) => {
        const { stage: stg, progress, milestone } = mapStageAndProgress(item.status);
        return {
          reference: item.referenceNumber,
          service: 'Police Clearance',
          detail: `1 applicant · ${item.purpose || 'National Police Check'}`,
          stage: stg,
          progress,
          milestone,
          updated: formatDate(item.updatedAt),
          eta: null,
          amountCents: 22000,
          applicant: item.fullName,
          destination: item.country || 'Australia',
          transactionId: item.referenceNumber,
          submittedAt: item.createdAt,
          departureDate: null
        };
      }),
      ...rvvOrders.map((item) => {
        const { stage: stg, progress, milestone } = mapStageAndProgress(item.status);
        return {
          reference: item.referenceNumber,
          service: 'Russian Visa Voucher',
          detail: `${item.voucherType || 'Tourist'} · ${item.entryType || 'Single entry'}`,
          stage: stg,
          progress,
          milestone,
          updated: formatDate(item.updatedAt),
          eta: formatDate(item.departureDate),
          amountCents: Math.round((item.estimatedFee || 150) * 100),
          applicant: item.fullName,
          destination: 'Russian Federation',
          transactionId: item.referenceNumber,
          submittedAt: item.createdAt,
          departureDate: item.departureDate
        };
      })
    ].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    if (stage) {
      allOrders = allOrders.filter((o) => o.stage === stage);
    }

    if (search) {
      const q = search.toLowerCase();
      allOrders = allOrders.filter(
        (o) =>
          o.reference.toLowerCase().includes(q) ||
          o.service.toLowerCase().includes(q) ||
          o.applicant.toLowerCase().includes(q) ||
          o.destination.toLowerCase().includes(q)
      );
    }

    res.json({
      success: true,
      count: allOrders.length,
      orders: allOrders
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/portal/documents
const getPortalDocuments = async (req, res, next) => {
  try {
    const userId = req.user?.id || '';
    const userEmail = req.user?.email || '';
    const { reference, state } = req.query;

    let sql = 'SELECT * FROM portal_documents WHERE (userId = ? OR email = ?)';
    const params = [userId, userEmail];

    if (reference) {
      sql += ' AND reference = ?';
      params.push(reference);
    }

    if (state) {
      sql += ' AND state = ?';
      params.push(state);
    }

    sql += ' ORDER BY createdAt DESC';

    const docs = await dbAll(sql, params);

    res.json({
      success: true,
      count: docs.length,
      documents: docs.map((d) => ({
        id: d.id,
        name: d.name,
        reference: d.reference,
        state: d.state,
        meta:
          d.meta ||
          `${
            path
              .extname(d.originalName || '')
              .replace('.', '')
              .toUpperCase() || 'FILE'
          } · ${d.fileSizeBytes ? (d.fileSizeBytes / 1024 / 1024).toFixed(1) : '1.0'} MB · ${formatDate(d.createdAt)}`,
        filePath: d.filePath,
        url: d.filePath ? `/uploads/documents/${path.basename(d.filePath)}` : null,
        createdAt: d.createdAt
      }))
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/portal/documents (Upload document file)
const uploadPortalDocument = async (req, res, next) => {
  try {
    const userId = req.user?.id || null;
    const userEmail = req.user?.email || req.body.email || '';
    const { reference, name } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No document file uploaded.' });
    }

    if (!reference || !name) {
      return res
        .status(400)
        .json({ success: false, message: 'Order reference and document name are required.' });
    }

    const docId = `DOC-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    const meta = `${path.extname(req.file.originalname).replace('.', '').toUpperCase()} · ${(req.file.size / 1024 / 1024).toFixed(1)} MB · ${formatDate(now)}`;

    await dbRun(
      `
      INSERT INTO portal_documents (
        id, userId, email, reference, name, state, meta, filePath, originalName, fileSizeBytes, mimeType, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        docId,
        userId,
        userEmail,
        reference,
        name,
        'received',
        meta,
        req.file.path,
        req.file.originalname,
        req.file.size,
        req.file.mimetype,
        now,
        now
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully.',
      document: {
        id: docId,
        reference,
        name,
        state: 'received',
        meta,
        url: `/uploads/documents/${path.basename(req.file.path)}`,
        originalName: req.file.originalname,
        fileSizeBytes: req.file.size,
        mimeType: req.file.mimetype
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/portal/passport-photos
const getPassportPhotos = async (req, res, next) => {
  try {
    const userId = req.user?.id || '';
    const userEmail = req.user?.email || '';

    const photos = await dbAll(
      'SELECT * FROM portal_passport_photos WHERE userId = ? OR email = ? ORDER BY createdAt DESC',
      [userId, userEmail]
    );

    res.json({
      success: true,
      count: photos.length,
      submissions: photos.map((p) => ({
        id: p.id,
        applicant: p.applicant,
        reference: p.reference || null,
        submittedAt: p.createdAt,
        state: p.state || 'in-review',
        note: p.note || 'File received. Pending review by CLS passport photo team.',
        url: p.filePath ? `/uploads/photos/${path.basename(p.filePath)}` : null
      }))
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/portal/passport-photos (Upload passport photo)
const uploadPassportPhoto = async (req, res, next) => {
  try {
    const userId = req.user?.id || null;
    const userEmail = req.user?.email || req.body.email || '';
    const { firstName, lastName, reference } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Passport photo file is required.' });
    }

    const applicant = `${firstName || ''} ${lastName || ''}`.trim() || 'Applicant';
    const photoId = `PHO-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    await dbRun(
      `
      INSERT INTO portal_passport_photos (
        id, userId, email, applicant, reference, state, note, filePath, originalName, fileSizeBytes, mimeType, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        photoId,
        userId,
        userEmail,
        applicant,
        reference || null,
        'in-review',
        'Photo uploaded successfully and submitted for validation against passport standards.',
        req.file.path,
        req.file.originalname,
        req.file.size,
        req.file.mimetype,
        now,
        now
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Passport photo submitted successfully.',
      submission: {
        id: photoId,
        applicant,
        reference: reference || null,
        submittedAt: now,
        state: 'in-review',
        note: 'Photo uploaded successfully and submitted for validation against passport standards.',
        url: `/uploads/photos/${path.basename(req.file.path)}`
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/portal/profile
const getProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id || '';
    const userEmail = req.user?.email || '';

    const user = await dbGet('SELECT * FROM users WHERE id = ? OR email = ?', [userId, userEmail]);
    const profile = await dbGet('SELECT * FROM portal_profiles WHERE userId = ? OR email = ?', [
      userId,
      userEmail
    ]);

    const names = (user?.fullName || '').split(' ');
    const firstName = profile?.firstName || names[0] || '';
    const lastName = profile?.lastName || names.slice(1).join(' ') || '';

    const address = profile?.addressJson
      ? JSON.parse(profile.addressJson)
      : {
          line1: '',
          city: '',
          state: '',
          postcode: '',
          country: 'Australia'
        };

    const delivery = profile?.deliveryAddressJson
      ? JSON.parse(profile.deliveryAddressJson)
      : { ...address };
    const billing = profile?.billingAddressJson
      ? JSON.parse(profile.billingAddressJson)
      : { ...address };

    res.json({
      success: true,
      profile: {
        title: profile?.title || 'Mr',
        firstName,
        lastName,
        phone: profile?.phone || user?.phone || '',
        mobile: profile?.mobile || '',
        company: profile?.company || '',
        email: userEmail || user?.email || '',
        passportNumber: profile?.passportNumber || '',
        address,
        delivery,
        billing
      }
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/portal/profile
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id || '';
    const userEmail = req.user?.email || '';

    const {
      title,
      firstName,
      lastName,
      phone,
      mobile,
      company,
      passportNumber,
      address,
      delivery,
      billing
    } = req.body;

    const now = new Date().toISOString();
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();

    if (userEmail) {
      await dbRun('UPDATE users SET fullName = ?, phone = ?, updatedAt = ? WHERE email = ?', [
        fullName,
        phone,
        now,
        userEmail
      ]);
    }

    const existing = await dbGet('SELECT * FROM portal_profiles WHERE userId = ? OR email = ?', [
      userId,
      userEmail
    ]);

    if (existing) {
      await dbRun(
        `
        UPDATE portal_profiles SET
          title = ?, firstName = ?, lastName = ?, phone = ?, mobile = ?, company = ?, passportNumber = ?,
          addressJson = ?, deliveryAddressJson = ?, billingAddressJson = ?, updatedAt = ?
        WHERE userId = ? OR email = ?
      `,
        [
          title || existing.title,
          firstName || existing.firstName,
          lastName || existing.lastName,
          phone || existing.phone,
          mobile || existing.mobile,
          company || existing.company,
          passportNumber || existing.passportNumber,
          address ? JSON.stringify(address) : existing.addressJson,
          delivery ? JSON.stringify(delivery) : existing.deliveryAddressJson,
          billing ? JSON.stringify(billing) : existing.billingAddressJson,
          now,
          userId,
          userEmail
        ]
      );
    } else {
      await dbRun(
        `
        INSERT INTO portal_profiles (
          userId, title, firstName, lastName, phone, mobile, company, email, passportNumber, addressJson, deliveryAddressJson, billingAddressJson, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          userId || `USER-${Date.now()}`,
          title || 'Mr',
          firstName || '',
          lastName || '',
          phone || '',
          mobile || '',
          company || '',
          userEmail,
          passportNumber || '',
          JSON.stringify(address || {}),
          JSON.stringify(delivery || {}),
          JSON.stringify(billing || {}),
          now
        ]
      );
    }

    res.json({
      success: true,
      message: 'Profile updated successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/portal/invoices
const getInvoices = async (req, res, next) => {
  try {
    const userId = req.user?.id || '';
    const userEmail = req.user?.email || '';

    const invoices = await dbAll(
      'SELECT * FROM portal_invoices WHERE userId = ? OR email = ? ORDER BY createdAt DESC',
      [userId, userEmail]
    );
    const dueInvoices = invoices.filter((inv) => inv.state === 'due' || inv.state === 'overdue');
    const balanceCents = dueInvoices.reduce((sum, inv) => sum + (inv.amountCents || 0), 0);

    res.json({
      success: true,
      count: invoices.length,
      balanceCents,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        reference: inv.reference,
        service: inv.service,
        issuedAt: inv.issuedAt,
        dueAt: inv.dueAt,
        amountCents: inv.amountCents,
        state: inv.state
      }))
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardSummary,
  getPortalOrders,
  getPortalDocuments,
  uploadPortalDocument,
  getPassportPhotos,
  uploadPassportPhoto,
  getProfile,
  updateProfile,
  getInvoices
};
