const request = require('supertest');
const app = require('../server');
const db = require('../config/db');
const authController = require('../controllers/authController');
const enquiryController = require('../controllers/enquiryController');
const serviceController = require('../controllers/serviceController');
const orderController = require('../controllers/orderController');
const portalController = require('../controllers/portalController');
const { optionalAuthToken, requireRole } = require('../middleware/auth');
const errorHandler = require('../middleware/errorHandler');
const upload = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';

describe('Capital Link Services Full API & Code Coverage Test Suite', () => {
  let userToken;
  let adminToken;
  let clientEmail;
  let adminEmail;
  let resetToken;
  let rvvRef;
  let legRef;
  let polRef;
  let enquiryId;

  const sampleFilePath = path.join(__dirname, 'test_document.pdf');
  const sampleImagePath = path.join(__dirname, 'test_passport_photo.jpg');

  beforeAll(() => {
    clientEmail = `client_${Date.now()}@example.com`;
    adminEmail = `admin_${Date.now()}@example.com`;
    fs.writeFileSync(sampleFilePath, 'Sample PDF content for integration testing');
    fs.writeFileSync(sampleImagePath, 'Sample JPEG content for passport photo testing');
  });

  afterAll(() => {
    if (fs.existsSync(sampleFilePath)) fs.unlinkSync(sampleFilePath);
    if (fs.existsSync(sampleImagePath)) fs.unlinkSync(sampleImagePath);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------
  // 1. HEALTH & BASE ROUTE
  // -------------------------------------------------------------
  it('GET / - Health check & route discovery', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.endpoints.portal).toBe('/api/portal');
  });

  // -------------------------------------------------------------
  // 2. AUTHENTICATION & PROFILE
  // -------------------------------------------------------------
  it('POST /api/auth/register - Validation errors', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'bad@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  it('POST /api/auth/register - Client registration', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName: 'Client FullName',
      email: clientEmail,
      password: 'Password123!',
      phone: '+61 400 111 222',
      country: 'AUS'
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('client');
    userToken = res.body.token;
  });

  it('POST /api/auth/register - Duplicate email error', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName: 'Client FullName',
      email: clientEmail,
      password: 'Password123!'
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it('POST /api/auth/register - Admin registration', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName: 'Admin FullName',
      email: adminEmail,
      password: 'AdminPassword123!',
      role: 'admin'
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('admin');
    adminToken = res.body.token;
  });

  it('POST /api/auth/login - Validation & Credential Errors', async () => {
    const resNoEmail = await request(app).post('/api/auth/login').send({ email: clientEmail });
    expect(resNoEmail.status).toBe(400);

    const resBadUser = await request(app).post('/api/auth/login').send({
      email: 'nonexistent_user_999@example.com',
      password: 'Password123!'
    });
    expect(resBadUser.status).toBe(401);

    const resBadPass = await request(app).post('/api/auth/login').send({
      email: clientEmail,
      password: 'WrongPassword123!'
    });
    expect(resBadPass.status).toBe(401);
  });

  it('POST /api/auth/login - Valid login', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: clientEmail,
      password: 'Password123!'
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('POST /api/auth/forgot-password & reset-password flow', async () => {
    const resNoEmail = await request(app).post('/api/auth/forgot-password').send({});
    expect(resNoEmail.status).toBe(400);

    const resUnknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'unknown@example.com' });
    expect(resUnknown.status).toBe(200);

    const resValid = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: clientEmail });
    expect(resValid.status).toBe(200);
    expect(resValid.body.resetToken).toBeDefined();
    resetToken = resValid.body.resetToken;

    const resResetMissing = await request(app)
      .post('/api/auth/reset-password')
      .send({ resetToken });
    expect(resResetMissing.status).toBe(400);

    const resResetInvalid = await request(app).post('/api/auth/reset-password').send({
      resetToken: 'invalid-token-12345',
      newPassword: 'NewPassword123!'
    });
    expect(resResetInvalid.status).toBe(400);

    const resResetValid = await request(app).post('/api/auth/reset-password').send({
      resetToken,
      newPassword: 'NewPassword123!'
    });
    expect(resResetValid.status).toBe(200);

    const relogin = await request(app).post('/api/auth/login').send({
      email: clientEmail,
      password: 'NewPassword123!'
    });
    expect(relogin.status).toBe(200);
    userToken = relogin.body.token;
  });

  it('GET /api/auth/me - Authenticated profile & auth header checks', async () => {
    const resNoAuth = await request(app).get('/api/auth/me');
    expect(resNoAuth.status).toBe(401);

    const resBadToken = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer badtoken');
    expect(resBadToken.status).toBe(403);

    const resMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${userToken}`);
    expect(resMe.status).toBe(200);
    expect(resMe.body.user.email).toBe(clientEmail);
  });

  it('authController.getProfile - 404 user profile not found branch', async () => {
    const dummyRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await authController.getProfile(
      { user: { id: 'non-existent-user-id-9999' } },
      dummyRes,
      jest.fn()
    );
    expect(dummyRes.status).toHaveBeenCalledWith(404);
  });

  // -------------------------------------------------------------
  // 3. SERVICE ORDER CREATION & TRACKING
  // -------------------------------------------------------------
  it('POST /api/orders/russian-visa-voucher - Create order with query prefill & attachment', async () => {
    const res = await request(app)
      .post('/api/orders/russian-visa-voucher?type=tourist&entry=single')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('passportCopy', sampleFilePath)
      .field('fullName', 'Russian Visa Traveller')
      .field('email', clientEmail)
      .field('phone', '+61400123456')
      .field('passportNumber', 'P99887766')
      .field('nationality', 'Australian')
      .field('arrivalDate', '2026-10-01')
      .field('departureDate', '2026-10-15')
      .field('citiesToVisit', 'Moscow, Sochi')
      .field('turnaroundTime', 'Express')
      .field('estimatedFee', '180');

    expect(res.status).toBe(201);
    expect(res.body.referenceNumber).toMatch(/^CLS-RVV-/);
    expect(res.body.order.passportFile).toBeDefined();
    rvvRef = res.body.referenceNumber;
  });

  it('GET /api/orders/russian-visa-voucher - GET route support', async () => {
    const res = await request(app).get(
      '/api/orders/russian-visa-voucher?type=business&entry=double'
    );
    expect(res.status).toBe(201);
    expect(res.body.referenceNumber).toMatch(/^CLS-RVV-/);
  });

  it('POST /api/orders/attestation - Create order with document files', async () => {
    const res = await request(app)
      .post(
        '/api/orders/attestation?type=personal&destination=united-arab-emirates&origin=australia&from=uae-attestation'
      )
      .set('Authorization', `Bearer ${userToken}`)
      .attach('documents', sampleFilePath)
      .field('fullName', 'Attestation Document Holder')
      .field('email', clientEmail)
      .field('phone', '+61400123456')
      .field('issuingState', 'NSW')
      .field('documentTypes', 'Birth Certificate')
      .field('documentCount', '1')
      .field('notes', 'Urgent attestation request');

    expect(res.status).toBe(201);
    expect(res.body.referenceNumber).toMatch(/^CLS-LEG-/);
    legRef = res.body.referenceNumber;
  });

  it('GET /api/orders/attestation - GET route support', async () => {
    const res = await request(app).get('/api/orders/attestation');
    expect(res.status).toBe(201);
    expect(res.body.referenceNumber).toMatch(/^CLS-LEG-/);
  });

  it('POST /api/orders/police-clearance - Create order with identity docs', async () => {
    const res = await request(app)
      .post('/api/orders/police-clearance?nationality=afghanistan&type=afp-national-police-check')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('identityDocs', sampleFilePath)
      .field('fullName', 'Police Clearance Applicant')
      .field('email', clientEmail)
      .field('phone', '+61400123456')
      .field('dateOfBirth', '1991-05-15')
      .field('gender', 'female')
      .field('passportNumber', 'P11223344')
      .field('country', 'Australia')
      .field('purpose', 'AFP National Police Check');

    expect(res.status).toBe(201);
    expect(res.body.referenceNumber).toMatch(/^CLS-POL-/);
    polRef = res.body.referenceNumber;
  });

  it('GET /api/orders/police-clearance - GET route support', async () => {
    const res = await request(app).get('/api/orders/police-clearance');
    expect(res.status).toBe(201);
    expect(res.body.referenceNumber).toMatch(/^CLS-POL-/);
  });

  it('POST /api/orders/checkout - Unified checkout for services', async () => {
    const resNoService = await request(app).post('/api/orders/checkout').send({});
    expect(resNoService.status).toBe(400);

    const resUnsupported = await request(app)
      .post('/api/orders/checkout')
      .send({ service: 'unknown' });
    expect(resUnsupported.status).toBe(400);

    const resRvv = await request(app)
      .post('/api/orders/checkout')
      .send({
        service: 'russian-visa-voucher',
        email: clientEmail,
        spec: { planId: 'tourist' }
      });
    expect(resRvv.status).toBe(200);
    expect(resRvv.body.referenceNumber).toMatch(/^CLS-RVV-/);

    const resPol = await request(app)
      .post('/api/orders/checkout')
      .send({
        service: 'police-clearance',
        email: clientEmail,
        spec: { clearanceId: 'afp' }
      });
    expect(resPol.status).toBe(200);
    expect(resPol.body.referenceNumber).toMatch(/^CLS-POL-/);
  });

  it('Order Tracking - GET and POST endpoints and non-prefix fallback branch', async () => {
    const dummyRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await orderController.trackOrder({ params: {} }, dummyRes, jest.fn());
    expect(dummyRes.status).toHaveBeenCalledWith(400);

    const resNotFound = await request(app).get('/api/orders/track/CLS-LEG-000000');
    expect(resNotFound.status).toBe(404);

    const resRvvTrack = await request(app).get(`/api/orders/track/${rvvRef}`);
    expect(resRvvTrack.status).toBe(200);

    const resLegTrack = await request(app).get(`/api/orders/track/${legRef}`);
    expect(resLegTrack.status).toBe(200);

    const resPolTrack = await request(app).get(`/api/orders/track/${polRef}`);
    expect(resPolTrack.status).toBe(200);

    const fallbackRef = legRef.replace('CLS-LEG-', 'CUSTOMREF-');
    const resFallbackTrack = await request(app).get(`/api/orders/track/${fallbackRef}`);
    expect(resFallbackTrack.status).toBe(404);

    const resPostMissing = await request(app).post('/api/orders/track').send({});
    expect(resPostMissing.status).toBe(400);

    const resPostLeg = await request(app)
      .post('/api/orders/track')
      .send({ reference: legRef, email: clientEmail });
    expect(resPostLeg.status).toBe(200);

    const resPostPol = await request(app)
      .post('/api/orders/track')
      .send({ reference: polRef, email: clientEmail });
    expect(resPostPol.status).toBe(200);

    const resPostRvv = await request(app)
      .post('/api/orders/track')
      .send({ reference: rvvRef, email: clientEmail });
    expect(resPostRvv.status).toBe(200);

    const resPostFallback = await request(app)
      .post('/api/orders/track')
      .send({ reference: 'NONPREFIX123' });
    expect(resPostFallback.status).toBe(404);
  });

  it('GET /api/orders/my-applications & Admin PATCH /api/orders/:referenceNumber/status', async () => {
    const resMyApps = await request(app)
      .get('/api/orders/my-applications')
      .set('Authorization', `Bearer ${userToken}`);
    expect(resMyApps.status).toBe(200);

    const resUpdateErr = await request(app)
      .patch(`/api/orders/${legRef}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(resUpdateErr.status).toBe(400);

    const resUpdate404 = await request(app)
      .patch('/api/orders/CLS-LEG-000000/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'completed' });
    expect(resUpdate404.status).toBe(404);

    const resLegUpd = await request(app)
      .patch(`/api/orders/${legRef}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'completed' });
    expect(resLegUpd.status).toBe(200);

    const resPolUpd = await request(app)
      .patch(`/api/orders/${polRef}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ready' });
    expect(resPolUpd.status).toBe(200);

    const resRvvUpd = await request(app)
      .patch(`/api/orders/${rvvRef}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'action-required' });
    expect(resRvvUpd.status).toBe(200);

    // Update status for embassy and processing branches in portal mapping
    await request(app)
      .patch(`/api/orders/${legRef}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'embassy' });
    await request(app)
      .patch(`/api/orders/${polRef}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'processing' });
    await request(app)
      .patch(`/api/orders/${rvvRef}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'unknown_custom_stage' });
  });

  // -------------------------------------------------------------
  // 4. CLIENT PORTAL ENDPOINTS & IMAGE UPLOADS
  // -------------------------------------------------------------
  it('GET /api/portal/dashboard - Portal dashboard summary', async () => {
    const res = await request(app)
      .get('/api/portal/dashboard')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/portal/orders - Portal order history with filters', async () => {
    const resAll = await request(app)
      .get('/api/portal/orders')
      .set('Authorization', `Bearer ${userToken}`);
    expect(resAll.status).toBe(200);

    const resFiltered = await request(app)
      .get(`/api/portal/orders?stage=completed&search=${legRef}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(resFiltered.status).toBe(200);
  });

  it('POST & GET /api/portal/documents - Upload and list documents', async () => {
    const resNoFile = await request(app)
      .post('/api/portal/documents')
      .set('Authorization', `Bearer ${userToken}`)
      .field('reference', rvvRef)
      .field('name', 'Passport Copy');
    expect(resNoFile.status).toBe(400);

    const resNoRef = await request(app)
      .post('/api/portal/documents')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('file', sampleFilePath)
      .field('name', 'Passport Copy');
    expect(resNoRef.status).toBe(400);

    const resUpload = await request(app)
      .post('/api/portal/documents')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('file', sampleFilePath)
      .field('reference', rvvRef)
      .field('name', 'Passport Copy');
    expect(resUpload.status).toBe(201);

    const resList = await request(app)
      .get(`/api/portal/documents?reference=${rvvRef}&state=received`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(resList.status).toBe(200);
  });

  it('POST & GET /api/portal/passport-photos - Upload and list passport photos', async () => {
    const resNoPhoto = await request(app)
      .post('/api/portal/passport-photos')
      .set('Authorization', `Bearer ${userToken}`)
      .field('firstName', 'Jane');
    expect(resNoPhoto.status).toBe(400);

    const resUpload = await request(app)
      .post('/api/portal/passport-photos')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('photo', sampleImagePath)
      .field('firstName', 'Jane')
      .field('lastName', 'Doe')
      .field('reference', rvvRef);
    expect(resUpload.status).toBe(201);

    const resList = await request(app)
      .get('/api/portal/passport-photos')
      .set('Authorization', `Bearer ${userToken}`);
    expect(resList.status).toBe(200);
  });

  it('GET & PUT /api/portal/profile - Profile and addresses management', async () => {
    const resGet = await request(app)
      .get('/api/portal/profile')
      .set('Authorization', `Bearer ${userToken}`);
    expect(resGet.status).toBe(200);

    const resPut = await request(app)
      .put('/api/portal/profile')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Ms',
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '+61400111222',
        mobile: '+61400333444',
        company: 'Doe Capital Link Ltd',
        passportNumber: 'P998877',
        address: {
          line1: '50 Pitt St',
          city: 'Sydney',
          state: 'NSW',
          postcode: '2000',
          country: 'Australia'
        },
        delivery: {
          line1: '50 Pitt St',
          city: 'Sydney',
          state: 'NSW',
          postcode: '2000',
          country: 'Australia'
        },
        billing: {
          line1: '50 Pitt St',
          city: 'Sydney',
          state: 'NSW',
          postcode: '2000',
          country: 'Australia'
        }
      });
    expect(resPut.status).toBe(200);
  });

  it('GET /api/portal/invoices - List invoices & calculate balance with seeded invoice', async () => {
    const invId = `inv-${Date.now()}`;
    const invNum = `INV-${Math.floor(1000 + Math.random() * 9000)}`;

    await db.dbRun(
      `INSERT INTO portal_invoices (id, userId, email, number, reference, service, issuedAt, dueAt, amountCents, state, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invId,
        'user-1',
        clientEmail,
        invNum,
        rvvRef,
        'Russian Visa Voucher',
        '2026-08-01',
        '2026-08-15',
        15000,
        'due',
        new Date().toISOString(),
        new Date().toISOString()
      ]
    );

    const res = await request(app)
      .get('/api/portal/invoices')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.invoices.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------
  // 5. LEGACY SERVICES ENDPOINTS & ENQUIRIES
  // -------------------------------------------------------------
  it('Legacy Services - Document Legalisation, Police Clearance, Russian Visa Voucher', async () => {
    const resLegBad = await request(app).post('/api/services/document-legalisation').send({});
    expect(resLegBad.status).toBe(400);

    const resLegOk = await request(app)
      .post('/api/services/document-legalisation')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        fullName: 'Legacy User',
        email: 'legacy@example.com',
        phone: '+61400000000',
        documentTypes: ['Apostille'],
        issuingState: 'ACT'
      });
    expect(resLegOk.status).toBe(201);

    const resPolBad = await request(app).post('/api/services/police-clearance').send({});
    expect(resPolBad.status).toBe(400);

    const resPolOk = await request(app)
      .post('/api/services/police-clearance')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        fullName: 'Legacy Police',
        email: 'police@example.com',
        phone: '+61400000000',
        dateOfBirth: '1990-01-01',
        passportNumber: 'P123',
        purpose: 'Work'
      });
    expect(resPolOk.status).toBe(201);

    const resRvvBad = await request(app).post('/api/services/russian-visa-voucher').send({});
    expect(resRvvBad.status).toBe(400);

    const resRvvOk = await request(app)
      .post('/api/services/russian-visa-voucher')
      .send({
        voucherType: 'Business Invitation',
        entryType: 'Multiple Entry',
        fullName: 'Legacy Russian',
        passportNumber: 'P123',
        nationality: 'Australian',
        email: 'russia@example.com',
        phone: '+61400000000',
        arrivalDate: '2026-10-01',
        departureDate: '2026-10-10',
        citiesToVisit: ['Moscow', 'Kazan'],
        turnaroundTime: 'Express'
      });
    expect(resRvvOk.status).toBe(201);
  });

  it('Enquiry Controller - Submit & Admin Management with filter', async () => {
    const resBadEnq = await request(app).post('/api/enquiries').send({});
    expect(resBadEnq.status).toBe(400);

    const resOkEnq = await request(app).post('/api/enquiries').send({
      fullName: 'Enquiry Sender',
      email: 'enq@example.com',
      serviceCategory: 'police_clearance',
      subject: 'Question on Apostille',
      message: 'Can I post my document?'
    });
    expect(resOkEnq.status).toBe(201);
    enquiryId = resOkEnq.body.enquiry.id;

    const resListEnq = await request(app)
      .get('/api/enquiries?status=new&serviceCategory=police_clearance')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resListEnq.status).toBe(200);

    const resBadStatus = await request(app)
      .patch(`/api/enquiries/${enquiryId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'invalid_status' });
    expect(resBadStatus.status).toBe(400);

    const res404Enq = await request(app)
      .patch('/api/enquiries/enq-9999999/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'resolved' });
    expect(res404Enq.status).toBe(404);

    const resUpdEnq = await request(app)
      .patch(`/api/enquiries/${enquiryId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'resolved' });
    expect(resUpdEnq.status).toBe(200);
  });

  // -------------------------------------------------------------
  // 6. MIDDLEWARE & CATCH ERROR COVERAGE
  // -------------------------------------------------------------
  it('Middleware & Error Handler Branch Coverage', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    const middleware = requireRole('admin');
    middleware({ user: null }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);

    const optNext1 = jest.fn();
    optionalAuthToken({ headers: { authorization: `Bearer ${userToken}` } }, {}, optNext1);
    expect(optNext1).toHaveBeenCalled();

    const optNext2 = jest.fn();
    optionalAuthToken({ headers: { authorization: 'Bearer invalid_token' } }, {}, optNext2);
    expect(optNext2).toHaveBeenCalled();

    const errValidation = new Error('Validation failed');
    errValidation.name = 'ValidationError';
    errorHandler(errValidation, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);

    const errFileType = new Error('Invalid file type');
    errorHandler(errFileType, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);

    const errCustom = new Error('Custom forbidden');
    errCustom.status = 403;
    errorHandler(errCustom, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);

    const errGeneric = new Error();
    errorHandler(errGeneric, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);

    const cb = jest.fn();
    upload.fileFilter({}, { mimetype: 'application/pdf' }, cb);
    expect(cb).toHaveBeenCalledWith(null, true);

    const cbErr = jest.fn();
    upload.fileFilter({}, { mimetype: 'application/x-executable' }, cbErr);
    expect(cbErr).toHaveBeenCalledWith(expect.any(Error), false);
  });

  it('Catch blocks & branch coverage across all controllers', async () => {
    const dummyRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    const nextRegister = jest.fn();
    jest
      .spyOn(db, 'dbGet')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await authController.register(
      { body: { fullName: 'a', email: 'b@c.com', password: 'p' } },
      dummyRes,
      nextRegister
    );
    expect(nextRegister).toHaveBeenCalled();

    const nextLogin = jest.fn();
    jest
      .spyOn(db, 'dbGet')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await authController.login({ body: { email: 'b@c.com', password: 'p' } }, dummyRes, nextLogin);
    expect(nextLogin).toHaveBeenCalled();

    const nextForgot = jest.fn();
    jest
      .spyOn(db, 'dbGet')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await authController.forgotPassword({ body: { email: 'b@c.com' } }, dummyRes, nextForgot);
    expect(nextForgot).toHaveBeenCalled();

    const nextReset = jest.fn();
    jest
      .spyOn(db, 'dbGet')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await authController.resetPassword(
      { body: { resetToken: 'tok', newPassword: 'p' } },
      dummyRes,
      nextReset
    );
    expect(nextReset).toHaveBeenCalled();

    const nextProf = jest.fn();
    jest
      .spyOn(db, 'dbGet')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await authController.getProfile({ user: { id: '1' } }, dummyRes, nextProf);
    expect(nextProf).toHaveBeenCalled();

    const nextEnqSub = jest.fn();
    jest
      .spyOn(db, 'dbRun')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await enquiryController.submitEnquiry(
      { body: { fullName: 'a', email: 'b@c.com', subject: 's', message: 'm' } },
      dummyRes,
      nextEnqSub
    );
    expect(nextEnqSub).toHaveBeenCalled();

    const nextEnqGet = jest.fn();
    jest
      .spyOn(db, 'dbAll')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await enquiryController.getAllEnquiries({ query: {} }, dummyRes, nextEnqGet);
    expect(nextEnqGet).toHaveBeenCalled();

    const nextEnqUpd = jest.fn();
    jest
      .spyOn(db, 'dbGet')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await enquiryController.updateEnquiryStatus(
      { params: { id: '1' }, body: { status: 'resolved' } },
      dummyRes,
      nextEnqUpd
    );
    expect(nextEnqUpd).toHaveBeenCalled();

    const nextServLeg = jest.fn();
    jest
      .spyOn(db, 'dbRun')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await serviceController.submitDocumentLegalisation(
      {
        body: {
          fullName: 'a',
          email: 'b@c.com',
          phone: '1',
          documentTypes: 'Apostille',
          issuingState: 'NSW'
        }
      },
      dummyRes,
      nextServLeg
    );
    expect(nextServLeg).toHaveBeenCalled();

    const nextServPol = jest.fn();
    jest
      .spyOn(db, 'dbRun')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await serviceController.submitPoliceClearance(
      {
        body: {
          fullName: 'a',
          email: 'b@c.com',
          phone: '1',
          dateOfBirth: '1990-01-01',
          passportNumber: '1',
          purpose: 'Check'
        }
      },
      dummyRes,
      nextServPol
    );
    expect(nextServPol).toHaveBeenCalled();

    const nextServRvv = jest.fn();
    jest
      .spyOn(db, 'dbRun')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await serviceController.submitRussianVisaVoucher(
      {
        body: {
          voucherType: 'a',
          entryType: 'b',
          fullName: 'c',
          passportNumber: 'd',
          nationality: 'e',
          email: 'f@g.com',
          phone: '1',
          arrivalDate: '1',
          departureDate: '2'
        }
      },
      dummyRes,
      nextServRvv
    );
    expect(nextServRvv).toHaveBeenCalled();

    const nextOrdTrack = jest.fn();
    jest
      .spyOn(db, 'dbGet')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await orderController.trackOrder(
      { params: { referenceNumber: 'CLS-LEG-1' } },
      dummyRes,
      nextOrdTrack
    );
    expect(nextOrdTrack).toHaveBeenCalled();

    const nextOrdTrackPost = jest.fn();
    jest
      .spyOn(db, 'dbGet')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await orderController.trackOrderPost(
      { body: { reference: 'CLS-LEG-1' } },
      dummyRes,
      nextOrdTrackPost
    );
    expect(nextOrdTrackPost).toHaveBeenCalled();

    const nextOrdRvv = jest.fn();
    jest
      .spyOn(db, 'dbRun')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await orderController.createRussianVisaVoucherOrder(
      { query: {}, body: {} },
      dummyRes,
      nextOrdRvv
    );
    expect(nextOrdRvv).toHaveBeenCalled();

    const nextOrdAtt = jest.fn();
    jest
      .spyOn(db, 'dbRun')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await orderController.createAttestationOrder({ query: {}, body: {} }, dummyRes, nextOrdAtt);
    expect(nextOrdAtt).toHaveBeenCalled();

    const nextOrdPol = jest.fn();
    jest
      .spyOn(db, 'dbRun')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await orderController.createPoliceClearanceOrder({ query: {}, body: {} }, dummyRes, nextOrdPol);
    expect(nextOrdPol).toHaveBeenCalled();

    const nextOrdChk = jest.fn();
    jest
      .spyOn(db, 'dbRun')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await orderController.checkoutOrder(
      { body: { service: 'police-clearance' } },
      dummyRes,
      nextOrdChk
    );
    expect(nextOrdChk).toHaveBeenCalled();

    const nextOrdMyApps = jest.fn();
    jest
      .spyOn(db, 'dbAll')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await orderController.getMyApplications(
      { user: { id: '1', email: 'a@b.com' } },
      dummyRes,
      nextOrdMyApps
    );
    expect(nextOrdMyApps).toHaveBeenCalled();

    const nextOrdUpd = jest.fn();
    jest
      .spyOn(db, 'dbRun')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await orderController.updateOrderStatus(
      { params: { referenceNumber: 'CLS-LEG-1' }, body: { status: 'completed' } },
      dummyRes,
      nextOrdUpd
    );
    expect(nextOrdUpd).toHaveBeenCalled();

    const nextPortDash = jest.fn();
    jest
      .spyOn(db, 'dbGet')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await portalController.getDashboardSummary({ user: { id: '1' } }, dummyRes, nextPortDash);
    expect(nextPortDash).toHaveBeenCalled();

    const nextPortOrd = jest.fn();
    jest
      .spyOn(db, 'dbAll')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await portalController.getPortalOrders({ user: { id: '1' }, query: {} }, dummyRes, nextPortOrd);
    expect(nextPortOrd).toHaveBeenCalled();

    const nextPortDoc = jest.fn();
    jest
      .spyOn(db, 'dbAll')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await portalController.getPortalDocuments(
      { user: { id: '1' }, query: {} },
      dummyRes,
      nextPortDoc
    );
    expect(nextPortDoc).toHaveBeenCalled();

    const nextPortUpDoc = jest.fn();
    jest
      .spyOn(db, 'dbRun')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await portalController.uploadPortalDocument(
      {
        file: { path: '/tmp/p', originalname: 'o.pdf', size: 100, mimetype: 'application/pdf' },
        body: { reference: 'R', name: 'N' }
      },
      dummyRes,
      nextPortUpDoc
    );
    expect(nextPortUpDoc).toHaveBeenCalled();

    const nextPortPho = jest.fn();
    jest
      .spyOn(db, 'dbAll')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await portalController.getPassportPhotos({ user: { id: '1' } }, dummyRes, nextPortPho);
    expect(nextPortPho).toHaveBeenCalled();

    const nextPortUpPho = jest.fn();
    jest
      .spyOn(db, 'dbRun')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await portalController.uploadPassportPhoto(
      {
        file: { path: '/tmp/p', originalname: 'o.jpg', size: 100, mimetype: 'image/jpeg' },
        body: { firstName: 'F' }
      },
      dummyRes,
      nextPortUpPho
    );
    expect(nextPortUpPho).toHaveBeenCalled();

    const nextPortProf = jest.fn();
    jest
      .spyOn(db, 'dbGet')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await portalController.getProfile({ user: { id: '1' } }, dummyRes, nextPortProf);
    expect(nextPortProf).toHaveBeenCalled();

    const nextPortUpProf = jest.fn();
    jest
      .spyOn(db, 'dbRun')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await portalController.updateProfile({ user: { id: '1' }, body: {} }, dummyRes, nextPortUpProf);
    expect(nextPortUpProf).toHaveBeenCalled();

    const nextPortInv = jest.fn();
    jest
      .spyOn(db, 'dbAll')
      .mockImplementationOnce(() => Promise.reject(new Error('Catch err test')));
    await portalController.getInvoices({ user: { id: '1' } }, dummyRes, nextPortInv);
    expect(nextPortInv).toHaveBeenCalled();
  });
});
