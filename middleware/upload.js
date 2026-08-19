const multer = require('multer');
const path = require('path');
const fs = require('fs');

const baseUploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');

// Ensure base upload directory and subdirectories exist
const subDirs = ['documents', 'photos', 'passports', 'identity', 'general'];
subDirs.forEach((subDir) => {
  const dirPath = path.join(baseUploadDir, subDir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let sub = 'general';
    if (file.fieldname.includes('photo')) sub = 'photos';
    else if (file.fieldname.includes('passport')) sub = 'passports';
    else if (file.fieldname.includes('identity')) sub = 'identity';
    else if (file.fieldname.includes('document') || file.fieldname.includes('file')) sub = 'documents';

    const targetDir = path.join(baseUploadDir, sub);
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    const safeField = file.fieldname.replace(/[^a-zA-Z0-9_-]/g, '');
    cb(null, `${safeField}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, WEBP, PDF, and DOC/DOCX files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter
});

module.exports = upload;
