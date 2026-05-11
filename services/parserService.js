const config = require('../config');

// ─── Gemini API ──────────────────────────────────────────────────────────────

const EMPTY_RESULT = { name: '', phones: [], email: '', company: '', address: '', city: '', state: '' };

const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    phones: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    email: { type: 'STRING' },
    company: { type: 'STRING' },
    address: { type: 'STRING' },
    city: { type: 'STRING' },
    state: { type: 'STRING' },
  },
  required: ['name', 'phones', 'email', 'company', 'address', 'city', 'state'],
};

const GEMINI_PROMPT = `Extract contact info from this business card OCR text.
The text may be Gujarati, Hindi, English, or mixed script.

{"name":"","phones":[],"email":"","company":"","address":"","city":"","state":""}

- name: person name only; if no person name is printed, use ""
- phones: max 2 phone numbers, digits only, keep leading +
- email: lowercase
- company: business/company/shop name; keep Gujarati/Hindi script as printed; do not copy it into name
- address: street/area only, no city/state/pin; keep Gujarati/Hindi script as printed
- city: city name; transliterate to English only if the output field convention needs English, otherwise keep printed script
- state: infer from city if needed (Pune=Maharashtra, Ahmedabad=Gujarat, Rajkot=Gujarat, Surat=Gujarat, Mumbai=Maharashtra, Delhi=Delhi, Bangalore=Karnataka, Chennai=Tamil Nadu, Hyderabad=Telangana, Kolkata=West Bengal)
- missing fields: "" or []
- If OCR has Gujarati digits or Hindi digits, convert phone numbers to 0-9 digits.
- Do not translate company/name/address/service words into English.
- ONLY return the JSON, nothing else
- Do not use markdown, code fences, labels, or explanation

Text: {{OCR_TEXT}}`;

// Clean OCR text — remove role markers and limit length
function cleanOcrText(rawText) {
  return String(rawText || '')
    .replace(/^---\s*(front|back|image)\s*---\s*/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .substring(0, 1500); // limit to 1500 chars — enough for any business card
}

async function callGemini(ocrText, retryCount = 0) {
  const cleanedText = cleanOcrText(ocrText);
  const prompt      = GEMINI_PROMPT.replace('{{OCR_TEXT}}', cleanedText);
  const url         = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent?key=${config.gemini.apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature:      0.1,
      maxOutputTokens:  1024,
      responseMimeType: 'application/json', // force JSON response
      responseSchema:   GEMINI_RESPONSE_SCHEMA,
    },
  };

  const response = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  // Rate limit — wait 30s and retry once
  if (response.status === 429) {
    if (retryCount < 1) {
      console.warn('Gemini rate limit hit. Retrying in 30s...');
      await new Promise((resolve) => setTimeout(resolve, 30000));
      return callGemini(ocrText, retryCount + 1);
    }
    throw new Error('Gemini rate limit exceeded after retry.');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const msg = payload?.error?.message || `Gemini HTTP ${response.status}`;
    if (retryCount < 1) {
      console.warn(`Gemini error: ${msg}. Retrying in 5s...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return callGemini(ocrText, retryCount + 1);
    }
    throw new Error(`Gemini API error: ${msg}`);
  }

  const candidates = payload?.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('Gemini returned no candidates.');
  }

  const candidate = candidates[0];
  const rawOutput = candidate?.content?.parts?.map((part) => part.text || '').join('\n').trim() || '';

  try {
    return parseGeminiJson(rawOutput);
  } catch (error) {
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new Error('Gemini response was cut off before valid JSON was complete. Increase maxOutputTokens and scan again.');
    }
    throw error;
  }
}

// ─── Validate & clean Gemini output ─────────────────────────────────────────

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stripMarkdownFences(value) {
  return String(value || '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function extractJsonObject(value) {
  const text = stripMarkdownFences(value);
  const start = text.indexOf('{');
  if (start === -1) return '';

  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (inString) {
      if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return '';
}

function repairCommonJsonIssues(value) {
  return value
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)'([^']+?)'\s*:/g, '$1"$2":')
    .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, text) => `:${JSON.stringify(text)}`);
}

function parseGeminiJson(rawOutput) {
  const candidates = [
    rawOutput,
    stripMarkdownFences(rawOutput),
    extractJsonObject(rawOutput),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const parsed = parseJson(candidate) || parseJson(repairCommonJsonIssues(candidate));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Gemini returned invalid JSON: ${String(rawOutput || '').substring(0, 300)}`);
}

function cleanPhone(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = normalizeDigits(value.trim());
  const hasPlus = trimmed.startsWith('+');
  const digits  = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return hasPlus ? `+${digits}` : digits;
}

function normalizeDigits(value) {
  const digitMaps = [
    ['૦', '0'], ['૧', '1'], ['૨', '2'], ['૩', '3'], ['૪', '4'],
    ['૫', '5'], ['૬', '6'], ['૭', '7'], ['૮', '8'], ['૯', '9'],
    ['०', '0'], ['१', '1'], ['२', '2'], ['३', '3'], ['४', '4'],
    ['५', '5'], ['६', '6'], ['७', '7'], ['८', '8'], ['९', '9'],
    ['٠', '0'], ['١', '1'], ['٢', '2'], ['٣', '3'], ['٤', '4'],
    ['٥', '5'], ['٦', '6'], ['٧', '7'], ['٨', '8'], ['٩', '9'],
  ];

  return digitMaps.reduce((text, [source, target]) => text.replaceAll(source, target), String(value || ''));
}

function cleanString(value) {
  if (!value || typeof value !== 'string') return '';
  return value.trim();
}

function validateAndClean(data) {
  if (!data || typeof data !== 'object') {
    return { ...EMPTY_RESULT };
  }

  let phones = [];
  if (Array.isArray(data.phones)) {
    phones = data.phones.map(cleanPhone).filter(Boolean).slice(0, 2);
  } else if (typeof data.phones === 'string' && data.phones.trim()) {
    phones = data.phones.split(',').map(cleanPhone).filter(Boolean).slice(0, 2);
  }

  return {
    name:    cleanString(data.name),
    phones,
    email:   cleanString(data.email).toLowerCase(),
    company: cleanString(data.company),
    address: cleanString(data.address),
    city:    cleanString(data.city),
    state:   cleanString(data.state),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

async function parseBusinessCard(rawText) {
  const raw     = await callGemini(rawText);
  const cleaned = validateAndClean(raw);
  return cleaned;
}

module.exports = {
  GEMINI_RESPONSE_SCHEMA,
  parseBusinessCard,
  parseGeminiJson,
  normalizeBusinessCardData: validateAndClean
};
