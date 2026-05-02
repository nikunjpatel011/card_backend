const { google } = require('googleapis');
const config = require('../config');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
let sheetsClient = null;

function getAppendRange() {
  const escapedSheetName = config.google.sheetName.replace(/'/g, "''");
  return `'${escapedSheetName}'!A:G`;
}

function parseServiceAccountJson() {
  if (!config.google.serviceAccountJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(config.google.serviceAccountJson);
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return parsed;
  } catch (error) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
}

function buildAuthClient() {
  if (!config.google.enabled) {
    return null;
  }

  if (!config.google.spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID is required when Google Sheets is enabled.');
  }

  const credentials = parseServiceAccountJson();
  if (credentials) {
    return new google.auth.GoogleAuth({
      credentials,
      scopes: SCOPES
    });
  }

  if (config.google.keyFile) {
    return new google.auth.GoogleAuth({
      keyFile: config.google.keyFile,
      scopes: SCOPES
    });
  }

  if (config.google.serviceAccountEmail && config.google.privateKey) {
    return new google.auth.JWT(
      config.google.serviceAccountEmail,
      null,
      config.google.privateKey,
      SCOPES
    );
  }

  throw new Error('Google Sheets credentials are missing.');
}

function getSheetsClient() {
  if (!config.google.enabled) {
    return null;
  }

  if (!sheetsClient) {
    sheetsClient = google.sheets({
      version: 'v4',
      auth: buildAuthClient()
    });
  }

  return sheetsClient;
}

async function appendCard(card) {
  if (!config.google.enabled) {
    return {
      skipped: true,
      reason: 'Google Sheets integration is disabled.'
    };
  }

  const sheets = getSheetsClient();
  const phones = Array.isArray(card.phones) ? card.phones : [];

  // Columns: A=Name, B=Number1, C=Number2, D=Company Name, E=Address, F=State, G=City
  const row = [
    card.name    || '',
    phones[0]    || '',
    phones[1]    || '',
    card.company || '',
    card.address || '',
    card.state   || '',
    card.city    || '',
  ];
  const range = getAppendRange();

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row]
    }
  });

  return {
    skipped: false,
    range
  };
}

module.exports = {
  appendCard
};
