import dotenv from 'dotenv';
dotenv.config();

import User from '../models/User.js';
import { connectDB } from '../config/db.js';

export async function ensureSuperAdmin() {
  const email = (process.env.SUPER_ADMIN_EMAIL || 'superadmin@sal.local').toLowerCase();
  const configuredPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (process.env.NODE_ENV === 'production' && (!configuredPassword || configuredPassword.length < 12)) {
    throw new Error('SUPER_ADMIN_PASSWORD must be set to a strong password in production.');
  }
  let user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    user = new User({
      name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
      email,
      role: 'super_admin',
      firstLogin: false
    });
    console.log('📦 Creating super admin account...');
  }
  if (!user.passwordHash) {
    await user.setPassword(configuredPassword || 'SuperAdmin@123');
  }
  user.active = true;
  user.isDeleted = false;
  await user.save();
  console.log(`✅ Super admin ready: ${user.email}`);
  return user;
}

// Run standalone: node src/seed/superAdmin.js
if (process.argv[1]?.endsWith('superAdmin.js')) {
  await connectDB();
  const user = await ensureSuperAdmin();
  console.log(`Super admin: ${user.email} | role: ${user.role}`);
  process.exit(0);
}
