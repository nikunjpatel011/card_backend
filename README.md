# Business Card Scanner Backend

Backend for processing business card images with Express, Multer, Gemini OCR/parsing, MongoDB result storage, and verified Google Sheets append.

## Setup

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Set MongoDB connection details in `.env`:

```env
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=scan-card
```

For OCR/parsing, set `GEMINI_API_KEY` in `.env`.

For Google Sheets, create a Google Cloud service account, enable the Google Sheets API, share the target spreadsheet with the service account email, then set `GOOGLE_SHEET_ID` and one credential option in `.env`.

For local OCR-only testing, set:

```env
SHEETS_ENABLED=false
```

## Upload Fields

`POST /upload` accepts `multipart/form-data` with JPG or PNG files.

- `images` or `image`: each file is processed as a separate card.
- `front` and `back`: paired by upload index and processed as one card.
- `frontImages` and `backImages`: array aliases for multiple paired cards.

Examples:

```bash
curl -F "images=@card.jpg" http://localhost:5000/upload
curl -F "front=@front.jpg" -F "back=@back.jpg" http://localhost:5000/upload
```

## Endpoints

### `POST /upload`

Queues uploaded card images for one-at-a-time OCR processing. Each completed job is automatically appended to Google Sheets and then returned with `saved: true`.

Response:

```json
{
  "success": true,
  "acceptedCards": 1,
  "jobs": [
    {
      "jobId": "uuid",
      "status": "pending"
    }
  ]
}
```

### `GET /status`

Returns queue status, per-status counts, job summaries, and daily usage.

### `GET /status?jobId=<id>`

Returns one job status: `pending`, `processing`, `completed`, or `failed`.

### `GET /results`

Returns completed extracted records from MongoDB.

### `GET /results?jobId=<id>`

Returns a single result when completed. Pending or processing jobs return HTTP `202`.

Use `includeRawText=true` to include OCR text for frontend review.

## Output Data

```json
{
  "name": "",
  "phones": [],
  "email": "",
  "company": "",
  "address": "",
  "state": "",
  "city": ""
}
```

## Daily Limit

The backend reserves quota when uploads are accepted and completes quota after a card is successfully processed and saved. Default limit is `200` cards per day and can be changed with `DAILY_CARD_LIMIT`.

## Notes

- OCR uses Gemini Vision by default for multilingual card text.
- Processing is intentionally one card at a time for stability.
- Uploaded files are deleted after processing.
- OCR results are appended to Google Sheets automatically when processing completes, then saved to MongoDB.
- Card result data is not written to `backend/data/results.json`.
