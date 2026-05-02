// Run this once to fix sheet headers:
// node fix-sheet-headers.js

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { google } = require('googleapis');

async function fixHeaders() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const spreadsheetId      = process.env.GOOGLE_SHEET_ID;
  const sheetName          = process.env.GOOGLE_SHEET_NAME || 'Scan Card';

  if (!serviceAccountJson || !spreadsheetId) {
    console.error('❌ Missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SHEET_ID in .env');
    process.exit(1);
  }

  const credentials = JSON.parse(serviceAccountJson);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  const auth   = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth });

  const escapedName = sheetName.replace(/'/g, "''");
  const range       = `'${escapedName}'!A1:G1`;

  // Set correct headers in row 1
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: {
      values: [['Name', 'Number 1', 'Number 2', 'Company Name', 'Address', 'State', 'City']],
    },
  });

  console.log('✅ Headers updated: Name | Number 1 | Number 2 | Company Name | Address | State | City');
  console.log('   Sheet:', sheetName);
  console.log('   Note: Old data rows may have wrong columns — delete them manually from sheet.');
}

fixHeaders().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
