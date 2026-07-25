import mongoose from 'mongoose';

function maskMongoUri(uri) {
  return uri.replace(/\/\/([^:/?#]+):([^@]+)@/, '//***:***@');
}

export async function connectDB() {
  const uri = process.env.MONGO_URI || (process.env.NODE_ENV === 'production' ? '' : 'mongodb://127.0.0.1:27017/sal_deploy1');
  if (!uri) throw new Error('MONGO_URI is required in production.');
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected:', maskMongoUri(uri));
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    throw err;
  }
}
  
