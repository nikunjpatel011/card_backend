const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const FormData = require('form-data');
const http = require('https');
const config = require('../config');
const parserService = require('./parserService');
const { cleanupFiles, ensureDir, safeBaseName } = require('../utils/fileUtils');

// ─── Image optimisation ──────────────────────────────────────────────────────

async function optimizeImage(file) {
  await ensureDir(config.upload.optimizedDir);
  const outputPath = path.join(
    config.upload.optimizedDir,
    `${safeBaseName(file.originalName)}-${Date.now()}-${crypto.randomUUID()}.jpg`
  );

  await sharp(file.path)
    .rotate()
    .resize({ width: config.ocr.maxImageWidth, withoutEnlargement: true })
    .jpeg({ quality: config.ocr.jpegQuality })
    .toFile(outputPath);

  return outputPath;
}

// ─── Gemini Vision OCR ───────────────────────────────────────────────────────

const GEMINI_VISION_OCR_PROMPT = `Read this business card image and extract every visible text line.

The card may contain Gujarati, Hindi, English, or mixed scripts.
- Preserve Gujarati/Hindi words exactly in their original script.
- Preserve phone numbers, addresses, shop names, and service descriptions.
- Keep the natural reading order: top-to-bottom, left-to-right.
- Do not translate.
- Do not explain.
- Return plain text only.`;

const GEMINI_VISION_EXTRACT_PROMPT = `Extract business card data directly from the uploaded image.

The card may contain Gujarati, Hindi, English, or mixed scripts.
If multiple images are supplied, treat them as the same card in the supplied order.
- rawText: every visible useful text line, preserving Gujarati/Hindi exactly.
- name: person name only; if no person name is printed, use "".
- phones: max 2 phone numbers, digits only, keep leading +.
- email: lowercase.
- company: business/company/shop name; keep Gujarati/Hindi script as printed; do not copy it into name.
- address: street/area only, no city/state/pin; keep Gujarati/Hindi script as printed.
- city: city name; transliterate to English only if the output field convention needs English, otherwise keep printed script.
- state: infer from city if needed.
- missing fields: "" or [].
- Do not translate company/name/address/service words into English.`;

const GEMINI_VISION_EXTRACT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    rawText: { type: 'STRING' },
    ...parserService.GEMINI_RESPONSE_SCHEMA.properties
  },
  required: ['rawText', ...parserService.GEMINI_RESPONSE_SCHEMA.required]
};

function hasUsefulText(text) {
  const value = String(text || '').trim();
  return value.length >= 8 && /[\p{L}\p{N}]/u.test(value);
}

function getMimeType(imagePath) {
  const extension = path.extname(imagePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableGeminiError(status, message) {
  return (
    status === 429 ||
    status === 503 ||
    /high demand|try again later|temporar/i.test(message || '')
  );
}

async function callGeminiVisionOcr(imagePath, retryCount = 0) {
  if (!config.gemini.apiKey) {
    throw new Error('Gemini API key is not configured.');
  }

  const imageBuffer = await fs.readFile(imagePath);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.ocrModel}:generateContent?key=${config.gemini.apiKey}`;

  const body = {
    contents: [{
      parts: [
        { text: GEMINI_VISION_OCR_PROMPT },
        {
          inlineData: {
            mimeType: getMimeType(imagePath),
            data: imageBuffer.toString('base64'),
          },
        },
      ],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 2048,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const msg = payload?.error?.message || `Gemini HTTP ${response.status}`;
    if (retryCount < 2 && isRetryableGeminiError(response.status, msg)) {
      await sleep(1500 * (retryCount + 1));
      return callGeminiVisionOcr(imagePath, retryCount + 1);
    }
    throw new Error(`Gemini Vision OCR error: ${msg}`);
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('\n')
    .trim();

  if (!hasUsefulText(text)) {
    throw new Error('Gemini Vision OCR returned empty text.');
  }

  return text;
}

function getCandidateText(payload) {
  return payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('\n')
    .trim() || '';
}

async function buildInlineImagePart(imagePath) {
  const imageBuffer = await fs.readFile(imagePath);

  return {
    inlineData: {
      mimeType: getMimeType(imagePath),
      data: imageBuffer.toString('base64'),
    },
  };
}

function hasExtractedFields(result) {
  return Boolean(
    result?.name ||
    result?.email ||
    result?.company ||
    result?.address ||
    result?.city ||
    result?.state ||
    (Array.isArray(result?.phones) && result.phones.length > 0)
  );
}

function buildRawTextFromResult(result) {
  if (!result) {
    return '';
  }

  return [
    result.name,
    ...(Array.isArray(result.phones) ? result.phones : []),
    result.email,
    result.company,
    result.address,
    result.city,
    result.state
  ].filter(Boolean).join('\n');
}

async function callGeminiVisionExtraction(files, retryCount = 0) {
  if (!config.gemini.apiKey) {
    throw new Error('Gemini API key is not configured.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.ocrModel}:generateContent?key=${config.gemini.apiKey}`;
  const imageParts = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    imageParts.push({ text: `Image ${index + 1}: ${file.role || 'front'}` });
    imageParts.push(await buildInlineImagePart(file.path));
  }

  const body = {
    contents: [{
      parts: [
        { text: GEMINI_VISION_EXTRACT_PROMPT },
        ...imageParts
      ],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_VISION_EXTRACT_SCHEMA,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const msg = payload?.error?.message || `Gemini HTTP ${response.status}`;
    if (retryCount < 2 && isRetryableGeminiError(response.status, msg)) {
      await sleep(1500 * (retryCount + 1));
      return callGeminiVisionExtraction(files, retryCount + 1);
    }
    throw new Error(`Gemini Vision extraction error: ${msg}`);
  }

  const rawOutput = getCandidateText(payload);
  const parsed = parserService.parseGeminiJson(rawOutput);
  const result = parserService.normalizeBusinessCardData(parsed);
  const rawText = String(parsed.rawText || '').trim() || buildRawTextFromResult(result);

  if (!hasUsefulText(rawText) && !hasExtractedFields(result)) {
    throw new Error('Gemini Vision extraction returned empty card data.');
  }

  return { rawText, result };
}

// ─── OCR.space API (multipart file upload) ───────────────────────────────────

function createTimeoutError(timeoutMs) {
  const error = new Error(`OCR.space request timed out after ${Math.round(timeoutMs / 1000)}s`);
  error.code = 'OCR_TIMEOUT';
  return error;
}

function isRetryableOcrError(error) {
  const message = error?.message || '';
  return (
    error?.code === 'OCR_TIMEOUT' ||
    /timed out/i.test(message) ||
    /OCR\.space HTTP (429|5\d\d)/.test(message)
  );
}

function buildOcrForm(imageBuffer, engine) {
  const form = new FormData();
  form.append('apikey',            config.ocr.ocrSpaceApiKey);
  form.append('language',          'eng');
  form.append('isOverlayRequired', 'false');
  form.append('detectOrientation', 'true');
  form.append('scale',             'true');
  form.append('OCREngine',         engine);
  form.append('isTable',           'false');
  form.append('file', imageBuffer, {
    filename:    'card.jpg',
    contentType: 'image/jpeg',
  });

  return form;
}

function postFormData(formData) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.ocr.space',
      path:     '/parse/image',
      method:   'POST',
      headers:  formData.getHeaders(),
      timeout:  config.ocr.requestTimeoutMs,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          reject(new Error('OCR.space returned invalid JSON'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      const error = createTimeoutError(config.ocr.requestTimeoutMs);
      req.destroy(error);
      reject(error);
    });

    formData.pipe(req);
  });
}

async function callOcrSpace(imagePath) {
  const imageBuffer = await fs.readFile(imagePath);
  const engines = [config.ocr.ocrEngine, config.ocr.fallbackOcrEngine]
    .map((engine) => String(engine || '').trim())
    .filter((engine, index, list) => engine && list.indexOf(engine) === index);

  let lastError = null;

  for (const engine of engines) {
    for (let attempt = 0; attempt <= config.ocr.maxRetries; attempt += 1) {
      try {
        const form = buildOcrForm(imageBuffer, engine);
        const { status, body } = await postFormData(form);

        if (status !== 200) {
          throw new Error(`OCR.space HTTP ${status}`);
        }

        if (body?.IsErroredOnProcessing) {
          const msg = Array.isArray(body.ErrorMessage)
            ? body.ErrorMessage.join(', ')
            : (body.ErrorMessage || 'OCR.space processing error');
          throw new Error(`OCR.space error: ${msg}`);
        }

        const parsedResults = body?.ParsedResults;
        if (!parsedResults || parsedResults.length === 0) {
          throw new Error('OCR.space returned no results.');
        }

        const text = parsedResults
          .map((r) => r.ParsedText || '')
          .join('\n')
          .trim();

        return text;
      } catch (error) {
        lastError = error;

        const canRetry =
          isRetryableOcrError(error) &&
          (attempt < config.ocr.maxRetries || engine !== engines[engines.length - 1]);

        if (!canRetry) {
          throw error;
        }

        await sleep(config.ocr.retryDelayMs);
      }
    }
  }

  throw lastError || new Error('OCR.space processing error');
}

// ─── Per-image recognise ─────────────────────────────────────────────────────

async function recognizeImage(file) {
  let optimizedPath = '';
  let primaryError = null;

  try {
    if (config.ocr.useGeminiVision) {
      try {
        optimizedPath = await optimizeImage(file);
        return await callGeminiVisionOcr(optimizedPath);
      } catch (error) {
        primaryError = error;
        if (!config.ocr.fallbackToOcrSpace) {
          throw error;
        }
        console.warn(`Gemini Vision OCR failed for ${file.originalName}: ${error.message}. Falling back to OCR.space.`);
      }
    }

    if (!optimizedPath) {
      optimizedPath = await optimizeImage(file);
    }
    const text = await callOcrSpace(optimizedPath);

    if (!text) {
      throw new Error('OCR completed but returned empty text.');
    }

    return text;
  } catch (error) {
    const fallbackContext = primaryError ? `; Gemini Vision OCR also failed: ${primaryError.message}` : '';
    throw new Error(`OCR failed for ${file.originalName}: ${error.message}${fallbackContext}`);
  } finally {
    await cleanupFiles([optimizedPath]);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

async function recognizeCard(files) {
  const textParts = [];

  for (const file of files) {
    const text = await recognizeImage(file);
    textParts.push(`--- ${file.role} ---\n${text}`);
  }

  const combinedText = textParts.join('\n\n').trim();

  if (!combinedText) {
    throw new Error('OCR returned empty text for the card.');
  }

  return combinedText;
}

async function extractBusinessCard(files) {
  if (config.ocr.useGeminiVision && config.ocr.useFastExtraction) {
    const optimizedPaths = [];

    try {
      const optimizedFiles = await Promise.all(files.map(async (file) => {
        const optimizedPath = await optimizeImage(file);
        optimizedPaths.push(optimizedPath);
        return {
          ...file,
          path: optimizedPath
        };
      }));

      return await callGeminiVisionExtraction(optimizedFiles);
    } catch (error) {
      console.warn(`Fast Gemini extraction failed: ${error.message}. Falling back to OCR and parse pipeline.`);
    } finally {
      await cleanupFiles(optimizedPaths);
    }
  }

  const rawText = await recognizeCard(files);
  const result = await parserService.parseBusinessCard(rawText);
  return { rawText, result };
}

module.exports = {
  extractBusinessCard,
  recognizeCard
};
