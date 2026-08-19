const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '../cls_database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Promisified helper methods for database operations
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const initDatabase = async () => {
  // 1. Users table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      fullName TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      phone TEXT,
      country TEXT DEFAULT 'AUS',
      role TEXT DEFAULT 'client',
      resetToken TEXT,
      resetTokenExpiry INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // 2. Document Legalisation table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS service_document_legalisation (
      id TEXT PRIMARY KEY,
      referenceNumber TEXT UNIQUE NOT NULL,
      userId TEXT,
      fullName TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      country TEXT DEFAULT 'AUS',
      documentTypes TEXT NOT NULL,
      issuingState TEXT NOT NULL,
      documentCount INTEGER DEFAULT 1,
      notes TEXT,
      filePaths TEXT,
      status TEXT DEFAULT 'submitted',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users (id)
    )
  `);

  // 3. Police Clearance table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS service_police_clearance (
      id TEXT PRIMARY KEY,
      referenceNumber TEXT UNIQUE NOT NULL,
      userId TEXT,
      fullName TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      dateOfBirth TEXT NOT NULL,
      gender TEXT,
      passportNumber TEXT NOT NULL,
      country TEXT DEFAULT 'AUS',
      purpose TEXT NOT NULL,
      identityDocPaths TEXT,
      status TEXT DEFAULT 'submitted',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users (id)
    )
  `);

  // 4. Russian Visa Voucher table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS service_russian_visa_voucher (
      id TEXT PRIMARY KEY,
      referenceNumber TEXT UNIQUE NOT NULL,
      userId TEXT,
      voucherType TEXT NOT NULL,
      entryType TEXT NOT NULL,
      fullName TEXT NOT NULL,
      passportNumber TEXT NOT NULL,
      nationality TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      arrivalDate TEXT NOT NULL,
      departureDate TEXT NOT NULL,
      citiesToVisit TEXT NOT NULL,
      accommodationDetails TEXT,
      turnaroundTime TEXT DEFAULT 'Standard',
      estimatedFee REAL DEFAULT 0,
      status TEXT DEFAULT 'submitted',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users (id)
    )
  `);

  // 5. Enquiries table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS enquiries (
      id TEXT PRIMARY KEY,
      fullName TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      serviceCategory TEXT DEFAULT 'general',
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      preferredContactMethod TEXT DEFAULT 'email',
      status TEXT DEFAULT 'new',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // 6. Portal Profiles table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS portal_profiles (
      userId TEXT PRIMARY KEY,
      title TEXT,
      firstName TEXT,
      lastName TEXT,
      phone TEXT,
      mobile TEXT,
      company TEXT,
      email TEXT NOT NULL,
      passportNumber TEXT,
      addressJson TEXT,
      deliveryAddressJson TEXT,
      billingAddressJson TEXT,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users (id)
    )
  `);

  // 7. Portal Documents table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS portal_documents (
      id TEXT PRIMARY KEY,
      userId TEXT,
      email TEXT NOT NULL,
      reference TEXT NOT NULL,
      name TEXT NOT NULL,
      state TEXT DEFAULT 'received',
      meta TEXT,
      filePath TEXT,
      originalName TEXT,
      fileSizeBytes INTEGER,
      mimeType TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // 8. Portal Passport Photos table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS portal_passport_photos (
      id TEXT PRIMARY KEY,
      userId TEXT,
      email TEXT NOT NULL,
      applicant TEXT NOT NULL,
      reference TEXT,
      state TEXT DEFAULT 'in-review',
      note TEXT,
      filePath TEXT,
      originalName TEXT,
      fileSizeBytes INTEGER,
      mimeType TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // 9. Portal Invoices table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS portal_invoices (
      id TEXT PRIMARY KEY,
      number TEXT UNIQUE NOT NULL,
      reference TEXT NOT NULL,
      userId TEXT,
      email TEXT NOT NULL,
      service TEXT NOT NULL,
      issuedAt TEXT NOT NULL,
      dueAt TEXT,
      amountCents INTEGER DEFAULT 0,
      state TEXT DEFAULT 'due',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  console.log('Database tables initialized successfully.');
};

module.exports = {
  db,
  dbRun,
  dbGet,
  dbAll,
  initDatabase
};
