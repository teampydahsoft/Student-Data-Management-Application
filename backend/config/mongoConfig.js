const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ Error connecting to MongoDB: ${error.message}`);
    // We don't exit the process here to allow the MySQL server to keep running
    // process.exit(1); 
    return null;
  }
};

let hrmsConnection = null;

const getHRMSConnection = () => {
  if (hrmsConnection) return hrmsConnection;

  if (!process.env.HRMS_MONGO_URL) {
    console.warn('⚠️ HRMS_MONGO_URL is not defined. HRMS connection will not be established.');
    return null;
  }

  try {
    hrmsConnection = mongoose.createConnection(process.env.HRMS_MONGO_URL);

    hrmsConnection.on('connected', () => {
      console.log(`✅ HRMS MongoDB Connected`);
    });

    hrmsConnection.on('error', (err) => {
      console.error(`❌ HRMS MongoDB Connection Error: ${err.message}`);
    });

    return hrmsConnection;
  } catch (error) {
    console.error(`❌ Error creating HRMS MongoDB connection: ${error.message}`);
    return null;
  }
};

module.exports = { connectDB, getHRMSConnection };
