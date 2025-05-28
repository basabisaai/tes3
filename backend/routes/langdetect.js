const express = require('express');
const langdetect = require('langdetect');
const router = express.Router();

// Bersihin teks supaya deteksi bahasa lebih akurat
function cleanText(text) {
  console.log("1 ct:", text);
  text = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[\u3000]/g, ' ')
   // .replace(/:/g, '')
    .replace(/;/g, '')
    .replace(/—/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^一-龥a-zA-Z0-9\s.,?!"'()]/g, '')
    .replace(/\(([\u4e00-\u9fff]+)\)\s+([A-Za-z])/g, ')。 $2')
    .trim(); // ✅ Ini bener kalau semua replace sudah ditutup
  console.log("2 ct:", text);  
  return text;
}

// Deteksi bahasa + confidence score
function detectLanguagesWithScore(text) {
  try {
    const cleanedText = cleanText(text);
    const detections = langdetect.detect(cleanedText); // [{ lang, prob }]
    return detections.map(d => ({
      lang: d.lang.startsWith('zh') ? 'zh-CN' : d.lang,
      prob: d.prob
    }));
  } catch (err) {
    console.error('Language detection error:', err);
    return [];
  }
}

// Bahasa yang dianggap mengganggu (selain Inggris & Mandarin)
const forbiddenLangs = ['id', 'ms', 'jv', 'su', 'tl', 'nl', 'fr', 'de', 'vi', 'hi', 'ko', 'ja', 'ru', 'ar', 'es', 'pt'];

router.post('/langdetect', async (req, res) => {
  const { text } = req.body;
  console.log("Text received by /langdetect:", text);
  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'Text required' });
  }

  try {
    const detections = detectLanguagesWithScore(text);
    const threshold = 0.15;

    const langsAboveThreshold = detections
      .filter(d => d.prob >= threshold)
      .map(d => d.lang);

    const langsSet = new Set(langsAboveThreshold);

    const allowedLangs = ['en', 'zh-CN'];
    const onlyAllowedLanguages = [...langsSet].every(lang => allowedLangs.includes(lang));
    const containsForbidden = [...langsSet].some(lang => forbiddenLangs.includes(lang));

    let language = 'unknown';
    let isSupported = false;

    if (onlyAllowedLanguages && !containsForbidden) {
      if (langsSet.size === 1) {
        if (langsSet.has('en')) {
          language = 'en-US';
          isSupported = true;
        } else if (langsSet.has('zh-CN')) {
          language = 'zh-CN';
          isSupported = true;
        }
      } else if (langsSet.size === 2 && langsSet.has('en') && langsSet.has('zh-CN')) {
        language = 'mix-en-zh';
        isSupported = true;
      }
    }

    return res.json({
      language,
      isSupported,
      allDetected: [...langsSet],
      rawDetections: detections // optional: bisa dihapus kalau gak mau nampilin
    });

  } catch (err) {
    console.error('Language detection failure:', err);
    return res.status(500).json({ error: 'Language detection failed' });
  }
});

module.exports = router;
