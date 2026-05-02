require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function testOCR() {
  console.log('\n--- Testing OCR.space API ---');
  const body = new URLSearchParams({
    apikey:            process.env.OCR_SPACE_API_KEY,
    url:               'https://ocr.space/Content/Images/receipt-ocr-original.jpg',
    language:          'eng',
    isOverlayRequired: 'false',
    OCREngine:         '2',
  });

  const res  = await fetch('https://api.ocr.space/parse/image', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  const json = await res.json();

  if (json.IsErroredOnProcessing) {
    console.log('❌ OCR.space Error:', json.ErrorMessage);
    return false;
  }

  const text = json.ParsedResults?.[0]?.ParsedText || '';
  console.log('✅ OCR.space OK —', text.length, 'chars extracted');
  console.log('   Sample:', text.substring(0, 100).replace(/\n/g, ' '));
  return true;
}

async function testGemini() {
  console.log('\n--- Testing Gemini API ---');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url  = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: 'Reply with only the word: OK' }] }],
    generationConfig: { maxOutputTokens: 10 },
  };

  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const json = await res.json();

  if (!res.ok) {
    console.log('❌ Gemini Error:', json?.error?.message || res.status);
    return false;
  }

  const reply = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  console.log('✅ Gemini OK — reply:', reply);
  return true;
}

async function testFullFlow() {
  console.log('\n--- Testing Full Flow (OCR + Gemini parse) ---');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const sampleOcrText = `ANNA MARSHALL
CREATIVE DIRECTOR
610-446-0936
a.marshall@squaredupstudios.com
www.squaredupstudios.com
Squared Up Design Studios`;

  const url  = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const prompt = `Extract structured data from this business card text.
Return ONLY a valid JSON object with exactly these fields:
{"name":"","phones":[],"email":"","company":"","address":"","city":"","state":""}
Rules: phones = array of max 2 numbers (digits only). Return ONLY JSON, no markdown.
Business card text:\n${sampleOcrText}`;

  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    }),
  });
  const json = await res.json();

  if (!res.ok) {
    console.log('❌ Gemini parse Error:', json?.error?.message);
    return;
  }

  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  const jsonStr = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();

  try {
    const parsed = JSON.parse(jsonStr);
    console.log('✅ Full flow OK — parsed result:');
    console.log(JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.log('❌ JSON parse failed:', jsonStr.substring(0, 200));
  }
}

async function main() {
  console.log('=== API Test ===');
  const ocrOk    = await testOCR();
  const geminiOk = await testGemini();

  if (ocrOk && geminiOk) {
    await testFullFlow();
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
