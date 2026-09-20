require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// The cloud database (Aiven) requires SSL verified against its CA certificate.
// On Vercel the certificate comes from an environment variable; locally it can
// be read from a file. With neither set (local MAMP), SSL is not used.
function loadCaCertificate() {
  if (process.env.DB_CA_CERT) {
    return process.env.DB_CA_CERT.replace(/\\n/g, '\n');
  }
  if (process.env.DB_CA_FILE) {
    return fs.readFileSync(path.resolve(__dirname, '..', process.env.DB_CA_FILE), 'utf8');
  }
  return null;
}

const ca = loadCaCertificate();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  timezone: 'Z',
  // Kept small: each serverless instance opens its own pool,
  // and the free database tier limits connections.
  connectionLimit: 2,
  ssl: ca ? { ca } : undefined,
});

pool.pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

module.exports = pool;
