import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { connectDB } from './config/db.js';
import { ensureSuperAdmin } from './seed/superAdmin.js';

const port = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
    await ensureSuperAdmin();
    app.listen(port, () => {
      console.log(`\n🚀 SAL Backend running at http://localhost:${port}`);
      console.log(`📋 Login: http://localhost:${port}/login`);
      console.log(`👑 Super Admin: http://localhost:${port}/super-admin`);
      console.log(`🏫 Admin: http://localhost:${port}/admin`);
      console.log(`🎓 HOD: http://localhost:${port}/hod`);
      console.log(`👩‍🏫 Teacher: http://localhost:${port}/teacher`);
      console.log(`👨‍🎓 Student: http://localhost:${port}/student\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}
  
start();
