const router = require('express').Router();
const multer = require('multer');
const { createAuthedClient } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

// Fixed: a Supabase storage bucket ('kyc') was created with the right RLS
// policies specifically for KYC selfies, profile images, and listing images,
// and multer was already a dependency — but nothing anywhere ever used
// either. Every upload field across the app fell back to "paste a URL" as a
// workaround. This endpoint is the missing connection between them.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function authedClient(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  return createAuthedClient(token);
}

router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  const c = authedClient(req);
  const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${req.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await c.storage.from('kyc').upload(path, req.file.buffer, {
    contentType: req.file.mimetype,
    upsert: false
  });
  if (error) return res.status(400).json({ error: error.message });

  const { data: pub } = c.storage.from('kyc').getPublicUrl(path);
  res.json({ url: pub.publicUrl, path });
});

module.exports = router;
