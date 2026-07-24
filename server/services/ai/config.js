const env = process.env;

function enabled(name) {
  return String(env[name] || '').toLowerCase() === 'true';
}

module.exports = {
  providers: {
    openai: { key: env.OPENAI_API_KEY || '', enabled: enabled('ENABLE_OPENAI') },
    gemini: { key: env.GEMINI_API_KEY || '', enabled: enabled('ENABLE_GEMINI') },
    groq: { key: env.GROQ_API_KEY || '', enabled: enabled('ENABLE_GROQ') },
    googleVision: { key: env.GOOGLE_VISION_KEY || '', enabled: !!env.GOOGLE_VISION_KEY },
    googleTranslate: { key: env.GOOGLE_TRANSLATE_KEY || env.GOOGLE_VISION_KEY || '', enabled: !!(env.GOOGLE_TRANSLATE_KEY || env.GOOGLE_VISION_KEY) },
    textract: {
      accessKeyId: env.AWS_ACCESS_KEY_ID || '', secretAccessKey: env.AWS_SECRET_ACCESS_KEY || '', region: env.AWS_REGION || 'us-east-1',
      enabled: !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY)
    },
    whisper: { key: env.WHISPER_API_KEY || env.OPENAI_API_KEY || '', enabled: !!(env.WHISPER_API_KEY || env.OPENAI_API_KEY) }
  }
};
