const request = require('supertest');
const app = require('../server');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';

describe('Capital Link Services Backend REST API Test Suite', () => {
  let userToken;
  let testEmail;
  let rvvRef;
  let attRef;
  const sampleFilePath = path.join(__dirname, 'sample_test_doc.pdf');
  const sampleImagePath = path.join(__dirname, 'sample_photo.jpg');

  beforeAll(() => {
    testEmail = `testuser_${Date.now()}@example.com`;
    fs.writeFileSync(sampleFilePath, 'Dummy PDF content for CLS upload test');
    fs.writeFileSync(sampleImagePath, 'Dummy JPEG content for passport photo test');
  });

  afterAll(() => {
    if (fs.existsSync(sampleFilePath)) fs.unlinkSync(sampleFilePath);
    if (fs.existsSync(sampleImagePath)) fs.unlinkSync(sampleImagePath);
  });

  it('GET / - Health Check with Portal endpoint listed', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.endpoints.portal).toBe('/api/portal');
  });

  it('POST /api/auth/register - Register new client', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName: 'Test User CLS',
      email: testEmail,
      password: 'Password123!',
      phone: '+61 400 123 456',
      country: 'AUS'
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    userToken = res.body.token;
  });

  it('POST /api/auth/login - User Login', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: testEmail,
      password: 'Password123!'
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/auth/me - Authenticated Profile', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(testEmail);
  });

  it('POST /api/orders/russian-visa-voucher - Create Russian Voucher Order', async () => {
    const res = await request(app)
      .post('/api/orders/russian-visa-voucher?type=tourist&entry=single')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        fullName: 'Test User CLS',
        email: testEmail,
        phone: '+61 400 123 456',
        passportNumber: 'N9988776',
        nationality: 'Australian',
        arrivalDate: '2026-10-01',
        departureDate: '2026-10-15',
        citiesToVisit: 'Moscow, Saint Petersburg'
      });
    expect(res.status).toBe(201);
    expect(res.body.referenceNumber).toMatch(/^CLS-RVV-/);
    rvvRef = res.body.referenceNumber;
  });

  it('POST /api/orders/attestation - Create Document Attestation Order', async () => {
    const res = await request(app)
      .post(
        '/api/orders/attestation?type=personal&destination=united-arab-emirates&origin=australia'
      )
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        fullName: 'Test User CLS',
        email: testEmail,
        phone: '+61 400 123 456',
        issuingState: 'ACT',
        documentTypes: ['Birth Certificate', 'Degree Certificate'],
        documentCount: 2
      });
    expect(res.status).toBe(201);
    expect(res.body.referenceNumber).toMatch(/^CLS-LEG-/);
    attRef = res.body.referenceNumber;
  });

  it('POST /api/orders/police-clearance - Create Police Clearance Order', async () => {
    const res = await request(app)
      .post('/api/orders/police-clearance?nationality=afghanistan&type=afp-national-police-check')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        fullName: 'Test User CLS',
        email: testEmail,
        phone: '+61 400 123 456',
        dateOfBirth: '1992-08-20',
        passportNumber: 'N9988776',
        purpose: 'AFP National Police Check'
      });
    expect(res.status).toBe(201);
    expect(res.body.referenceNumber).toMatch(/^CLS-POL-/);
  });

  it('POST /api/orders/checkout - Checkout Order', async () => {
    const res = await request(app)
      .post('/api/orders/checkout')
      .send({
        service: 'police-clearance',
        email: testEmail,
        spec: { clearanceId: 'afp-national-police-check' }
      });
    expect(res.status).toBe(200);
    expect(res.body.referenceNumber).toMatch(/^CLS-POL-/);
  });

  it('GET /api/orders/track/:ref - Track Order', async () => {
    const res = await request(app).get(`/api/orders/track/${rvvRef}`);
    expect(res.status).toBe(200);
    expect(res.body.order.referenceNumber).toBe(rvvRef);
  });

  it('POST /api/orders/track - Track Order POST', async () => {
    const res = await request(app)
      .post('/api/orders/track')
      .send({ reference: attRef, email: testEmail });
    expect(res.status).toBe(200);
    expect(res.body.order.reference).toBe(attRef);
  });

  it('GET /api/portal/dashboard - Portal Dashboard Stats', async () => {
    const res = await request(app)
      .get('/api/portal/dashboard')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.stats).toHaveLength(4);
  });

  it('GET /api/portal/orders - Portal Orders History', async () => {
    const res = await request(app)
      .get('/api/portal/orders')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(3);
  });

  it('POST /api/portal/documents - Upload Document File', async () => {
    const res = await request(app)
      .post('/api/portal/documents')
      .set('Authorization', `Bearer ${userToken}`)
      .field('reference', rvvRef)
      .field('name', 'Passport Copy Scan')
      .attach('file', sampleFilePath);
    expect(res.status).toBe(201);
    expect(res.body.document.reference).toBe(rvvRef);
  });

  it('GET /api/portal/documents - List Portal Documents', async () => {
    const res = await request(app)
      .get('/api/portal/documents')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/portal/passport-photos - Upload Passport Photo', async () => {
    const res = await request(app)
      .post('/api/portal/passport-photos')
      .set('Authorization', `Bearer ${userToken}`)
      .field('firstName', 'Test')
      .field('lastName', 'User')
      .field('reference', rvvRef)
      .attach('photo', sampleImagePath);
    expect(res.status).toBe(201);
    expect(res.body.submission.applicant).toBe('Test User');
  });

  it('GET /api/portal/passport-photos - List Passport Photos', async () => {
    const res = await request(app)
      .get('/api/portal/passport-photos')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  it('GET & PUT /api/portal/profile - Fetch & Update Portal Profile', async () => {
    const getRes = await request(app)
      .get('/api/portal/profile')
      .set('Authorization', `Bearer ${userToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.profile).toBeDefined();

    const putRes = await request(app)
      .put('/api/portal/profile')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Dr',
        firstName: 'Test',
        lastName: 'User',
        phone: '+61 400 123 456',
        mobile: '+61 400 999 888',
        company: 'Capital Link Client Ltd',
        passportNumber: 'N9988776',
        address: {
          line1: '100 George St',
          city: 'Sydney',
          state: 'NSW',
          postcode: '2000',
          country: 'Australia'
        }
      });
    expect(putRes.status).toBe(200);
    expect(putRes.body.success).toBe(true);
  });

  it('GET /api/portal/invoices - List Portal Invoices', async () => {
    const res = await request(app)
      .get('/api/portal/invoices')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.invoices)).toBe(true);
  });
});
