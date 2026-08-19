const request = require('supertest');
const app = require('../server');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';

async function runTests() {
  console.log('🧪 Starting API Integration Tests for Capital Link Services Backend...\n');
  let passed = 0;
  let failed = 0;

  const assert = (condition, testName) => {
    if (condition) {
      console.log(`  ✅ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${testName}`);
      failed++;
    }
  };

  try {
    // 1. Health check
    const healthRes = await request(app).get('/');
    assert(healthRes.status === 200 && healthRes.body.success === true && healthRes.body.endpoints.portal === '/api/portal', 'GET / - Health Check with Portal');

    // 2. User Registration
    const testEmail = `testuser_${Date.now()}@example.com`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'Test User CLS',
        email: testEmail,
        password: 'Password123!',
        phone: '+61 400 123 456',
        country: 'AUS'
      });
    assert(regRes.status === 201 && regRes.body.token !== undefined, 'POST /api/auth/register - Register User');
    const userToken = regRes.body.token;

    // 3. User Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password: 'Password123!'
      });
    assert(loginRes.status === 200 && loginRes.body.success === true, 'POST /api/auth/login - User Login');

    // 4. Authenticated Profile Fetch
    const profileRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${userToken}`);
    assert(profileRes.status === 200 && profileRes.body.user.email === testEmail, 'GET /api/auth/me - Authenticated Profile');

    // 5. Submit Russian Visa Voucher Order
    const rvvRes = await request(app)
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
    assert(rvvRes.status === 201 && rvvRes.body.referenceNumber.startsWith('CLS-RVV-'), 'POST /api/orders/russian-visa-voucher - Create Russian Voucher Order');
    const rvvRef = rvvRes.body.referenceNumber;

    // 6. Submit Document Attestation Order
    const attRes = await request(app)
      .post('/api/orders/attestation?type=personal&destination=united-arab-emirates&origin=australia')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        fullName: 'Test User CLS',
        email: testEmail,
        phone: '+61 400 123 456',
        issuingState: 'ACT',
        documentTypes: ['Birth Certificate', 'Degree Certificate'],
        documentCount: 2
      });
    assert(attRes.status === 201 && attRes.body.referenceNumber.startsWith('CLS-LEG-'), 'POST /api/orders/attestation - Create Document Attestation Order');
    const attRef = attRes.body.referenceNumber;

    // 7. Submit Police Clearance Order
    const polRes = await request(app)
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
    assert(polRes.status === 201 && polRes.body.referenceNumber.startsWith('CLS-POL-'), 'POST /api/orders/police-clearance - Create Police Clearance Order');

    // 8. Order Checkout
    const chkRes = await request(app)
      .post('/api/orders/checkout')
      .send({
        service: 'police-clearance',
        email: testEmail,
        spec: { clearanceId: 'afp-national-police-check' }
      });
    assert(chkRes.status === 200 && chkRes.body.referenceNumber.startsWith('CLS-POL-'), 'POST /api/orders/checkout - Checkout Order');

    // 9. Track Order by Reference
    const trackRes = await request(app).get(`/api/orders/track/${rvvRef}`);
    assert(trackRes.status === 200 && trackRes.body.order.referenceNumber === rvvRef, `GET /api/orders/track/${rvvRef} - Track Order`);

    // 10. Track Order via POST
    const trackPostRes = await request(app)
      .post('/api/orders/track')
      .send({ reference: attRef, email: testEmail });
    assert(trackPostRes.status === 200 && trackPostRes.body.order.reference === attRef, 'POST /api/orders/track - Track Order POST');

    // 11. Portal Dashboard Summary
    const portalDashRes = await request(app)
      .get('/api/portal/dashboard')
      .set('Authorization', `Bearer ${userToken}`);
    assert(portalDashRes.status === 200 && portalDashRes.body.stats.length === 4, 'GET /api/portal/dashboard - Portal Dashboard Stats');

    // 12. Portal Orders List
    const portalOrdersRes = await request(app)
      .get('/api/portal/orders')
      .set('Authorization', `Bearer ${userToken}`);
    assert(portalOrdersRes.status === 200 && portalOrdersRes.body.count >= 3, 'GET /api/portal/orders - Portal Orders History');

    // Create a temporary dummy file for upload testing
    const sampleFilePath = path.join(__dirname, 'sample_test_doc.pdf');
    fs.writeFileSync(sampleFilePath, 'Dummy PDF content for CLS upload test');

    // 13. Portal Document Upload
    const docUploadRes = await request(app)
      .post('/api/portal/documents')
      .set('Authorization', `Bearer ${userToken}`)
      .field('reference', rvvRef)
      .field('name', 'Passport Copy Scan')
      .attach('file', sampleFilePath);
    assert(docUploadRes.status === 201 && docUploadRes.body.document.reference === rvvRef, 'POST /api/portal/documents - Upload Document File');

    // 14. Portal Get Documents
    const portalDocsRes = await request(app)
      .get('/api/portal/documents')
      .set('Authorization', `Bearer ${userToken}`);
    assert(portalDocsRes.status === 200 && portalDocsRes.body.count >= 1, 'GET /api/portal/documents - List Portal Documents');

    // Create a dummy image file for photo testing
    const sampleImagePath = path.join(__dirname, 'sample_photo.jpg');
    fs.writeFileSync(sampleImagePath, 'Dummy JPEG content for passport photo test');

    // 15. Portal Passport Photo Upload
    const photoUploadRes = await request(app)
      .post('/api/portal/passport-photos')
      .set('Authorization', `Bearer ${userToken}`)
      .field('firstName', 'Test')
      .field('lastName', 'User')
      .field('reference', rvvRef)
      .attach('photo', sampleImagePath);
    assert(photoUploadRes.status === 201 && photoUploadRes.body.submission.applicant === 'Test User', 'POST /api/portal/passport-photos - Upload Passport Photo');

    // 16. Portal Get Passport Photos
    const portalPhotosRes = await request(app)
      .get('/api/portal/passport-photos')
      .set('Authorization', `Bearer ${userToken}`);
    assert(portalPhotosRes.status === 200 && portalPhotosRes.body.count >= 1, 'GET /api/portal/passport-photos - List Passport Photos');

    // 17. Portal Profile GET & PUT
    const getProfRes = await request(app)
      .get('/api/portal/profile')
      .set('Authorization', `Bearer ${userToken}`);
    assert(getProfRes.status === 200 && getProfRes.body.profile !== undefined, 'GET /api/portal/profile - Fetch Portal Profile');

    const updateProfRes = await request(app)
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
        address: { line1: '100 George St', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'Australia' }
      });
    assert(updateProfRes.status === 200 && updateProfRes.body.success === true, 'PUT /api/portal/profile - Update Portal Profile');

    // 18. Portal Invoices
    const invoicesRes = await request(app)
      .get('/api/portal/invoices')
      .set('Authorization', `Bearer ${userToken}`);
    assert(invoicesRes.status === 200 && Array.isArray(invoicesRes.body.invoices), 'GET /api/portal/invoices - List Portal Invoices');

    // Clean up temporary test files
    if (fs.existsSync(sampleFilePath)) fs.unlinkSync(sampleFilePath);
    if (fs.existsSync(sampleImagePath)) fs.unlinkSync(sampleImagePath);

    console.log(`\n=================================================`);
    console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`=================================================`);

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
