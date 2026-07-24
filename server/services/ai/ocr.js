const config = require('./config');
const { signAwsRequest } = require('./aws-sigv4');

function extractTextFallback(file) {
  return {
    text: '',
    provider: 'fallback',
    note: `OCR skipped for ${file?.file_type || 'file'} because no OCR provider is configured.`
  };
}

// Real Google Cloud Vision OCR — only runs if GOOGLE_VISION_KEY is set.
// file.url must be a publicly reachable URL (e.g. from /api/uploads).
async function extractTextGoogleVision(file) {
  const key = config.providers.googleVision.key;
  if (!key || !file?.url) return extractTextFallback(file);
  try {
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { source: { imageUri: file.url } }, features: [{ type: 'TEXT_DETECTION' }] }]
      })
    });
    if (!response.ok) return extractTextFallback(file);
    const data = await response.json();
    const text = data.responses?.[0]?.fullTextAnnotation?.text || '';
    return { text, provider: 'googleVision', note: text ? null : 'No text detected in image.' };
  } catch {
    return extractTextFallback(file);
  }
}

// Real AWS Textract OCR (DetectDocumentText — images only, not PDF; PDF
// support needs the async StartDocumentTextDetection API, not implemented
// here since it requires an S3 bucket + polling, a bigger scope than a
// synchronous OCR call). Only runs if AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
// are both set.
async function extractTextTextract(file) {
  const { accessKeyId, secretAccessKey, region } = config.providers.textract;
  if (!accessKeyId || !secretAccessKey || !file?.url) return extractTextFallback(file);
  try {
    const fileRes = await fetch(file.url);
    if (!fileRes.ok) return extractTextFallback(file);
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    if (buffer.length > 5 * 1024 * 1024) return { text: '', provider: 'fallback', note: 'File too large for synchronous Textract (5MB limit).' };

    const host = `textract.${region}.amazonaws.com`;
    const body = JSON.stringify({ Document: { Bytes: buffer.toString('base64') } });
    const headers = signAwsRequest({
      accessKeyId, secretAccessKey, region, service: 'textract', host,
      method: 'POST', path: '/', body, target: 'Textract.DetectDocumentText'
    });
    const response = await fetch(`https://${host}/`, { method: 'POST', headers, body });
    if (!response.ok) return extractTextFallback(file);
    const data = await response.json();
    const text = (data.Blocks || []).filter(b => b.BlockType === 'LINE').map(b => b.Text).join('\n');
    return { text, provider: 'textract', note: text ? null : 'No text detected in document.' };
  } catch {
    return extractTextFallback(file);
  }
}

// Entry point used by cv-analysis.js — picks a provider based on config
// (provider-router priority: googleVision, then textract), falls back to
// plain (empty) text extraction if neither is configured.
async function extractText(file) {
  if (config.providers.googleVision.enabled) return extractTextGoogleVision(file);
  if (config.providers.textract.enabled) return extractTextTextract(file);
  return extractTextFallback(file);
}

module.exports = { extractTextFallback, extractTextGoogleVision, extractTextTextract, extractText };
