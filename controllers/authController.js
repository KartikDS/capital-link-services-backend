const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'cls_super_secret_jwt_key_2026_australia';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Register User
const register = async (req, res, next) => {
  try {
    const { fullName, email, password, phone, country, role } = req.body;

    if (!fullName || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Full name, email, and password are required' });
    }

    const existingUser = await db.dbGet('SELECT id FROM users WHERE email = ?', [
      email.toLowerCase().trim()
    ]);
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: 'User with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const userId = 'user-' + crypto.randomUUID();
    const userRole = role === 'admin' ? 'admin' : 'client';
    const userCountry = country || 'AUS';
    const now = new Date().toISOString();

    await db.dbRun(
      `INSERT INTO users (id, fullName, email, passwordHash, phone, country, role, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        fullName.trim(),
        email.toLowerCase().trim(),
        passwordHash,
        phone || '',
        userCountry,
        userRole,
        now,
        now
      ]
    );

    const token = jwt.sign(
      { id: userId, email: email.toLowerCase().trim(), role: userRole, fullName: fullName.trim() },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: userId,
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        phone: phone || '',
        country: userCountry,
        role: userRole
      }
    });
  } catch (error) {
    next(error);
  }
};

// Login User
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await db.dbGet('SELECT * FROM users WHERE email = ?', [
      email.toLowerCase().trim()
    ]);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        country: user.country,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

// Forgot Password
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await db.dbGet('SELECT * FROM users WHERE email = ?', [
      email.toLowerCase().trim()
    ]);
    if (!user) {
      // Return success to avoid email enumeration
      return res.json({
        success: true,
        message: 'If an account with that email exists, password reset instructions have been sent.'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour expiry

    await db.dbRun(
      'UPDATE users SET resetToken = ?, resetTokenExpiry = ?, updatedAt = ? WHERE id = ?',
      [resetToken, resetTokenExpiry, new Date().toISOString(), user.id]
    );

    res.json({
      success: true,
      message: 'Password reset instructions have been generated.',
      resetToken, // Returned for dev testing convenience
      expiresIn: '1 hour'
    });
  } catch (error) {
    next(error);
  }
};

// Reset Password
const resetPassword = async (req, res, next) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res
        .status(400)
        .json({ success: false, message: 'Reset token and new password are required' });
    }

    const user = await db.dbGet('SELECT * FROM users WHERE resetToken = ?', [resetToken]);

    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < Date.now()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    const now = new Date().toISOString();

    await db.dbRun(
      'UPDATE users SET passwordHash = ?, resetToken = NULL, resetTokenExpiry = NULL, updatedAt = ? WHERE id = ?',
      [passwordHash, now, user.id]
    );

    res.json({
      success: true,
      message: 'Password has been reset successfully. You can now login with your new password.'
    });
  } catch (error) {
    next(error);
  }
};

// Get User Profile
const getProfile = async (req, res, next) => {
  try {
    const user = await db.dbGet(
      'SELECT id, fullName, email, phone, country, role, createdAt FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User profile not found' });
    }
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  getProfile
};
