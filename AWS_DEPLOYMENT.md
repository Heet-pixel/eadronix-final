# AWS + MongoDB Atlas Deployment Checklist

1. Create a MongoDB Atlas cluster and copy the `mongodb+srv://...` connection string.
2. In Atlas Network Access, allow the AWS app IP or temporarily allow `0.0.0.0/0` while testing.
3. Set AWS environment variables from `.env.example`, especially `MONGO_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SUPER_ADMIN_*`, and Gmail settings.
4. Use Node.js 18 or newer.
5. Run `npm install --omit=dev` on the server.
6. Start with `npm start`; AWS Elastic Beanstalk/Heroku-style runners can use the included `Procfile`.
7. Open `/api/health` after deployment to confirm the app is live.
8. Open `/login` and activate the first super admin account.
