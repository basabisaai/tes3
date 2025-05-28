// tts.js - Fixed to handle all colon edge cases and hanzi in brackets with question mark

const express = require('express');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const router = express.Router();

/**
 * Comprehensive text cleaning function with improved edge case handling
 * Specifically fixes the pattern: number - period - pinyin - open bracket - hanzi - close bracket - colon or question mark
 */
function cleanText(text) {
  console.log("Original text in cleanTex xx:", text);
  
  // IMPORTANT: Preserve Chinese question marks - don't remove or replace them
  const chineseQuestionMark = "？";
  
  // Temporarily mark Chinese question marks to preserve them
  text = text.replace(new RegExp(chineseQuestionMark, 'g'), '{{CHINESE_QUESTION_MARK}}');
  
  // Handle specific edge cases first:
  
  // Fix "Beijing: 1. Dongcheng" pattern (text before colon followed by numbered list)
  text = text.replace(/(\w+):(\s*\d+\.\s+)/g, '$1 $2');
  
  // CRITICAL: Remove all colons and asteriks, but preserve our placeholder
  text = text.replace(/[:*]/g, ' ');
  
  // Handle edge case: number.pinyin(hanzi) pattern
  text = text.replace(/(\d+)\.\s*([a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+)\s*\(([一-龥]+)\)/g, 
    '$1. $2 $3');
  
  // IMPORTANT: Don't remove parentheses with Chinese characters
  // But do fix the format to ensure proper processing
  text = text.replace(/\(([一-龥]+[？]?)\)/g, ' $1 ');
  text = text.replace(/([a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s]+)\?\s*\(([一-龥]+)([？]?)\)/g, '$1 ($2$3)');
  
  // Change English(Chinese) to (Chinese) but preserve ? marks
  text = text.replace(/([a-zA-Z']+)\s*\(([一-龥]+[？]?)\)/g, '($2)');
  
  // Make sure any colons that might have been missed are removed
  text = text.replace(/:/g, '.');
  
  // Restore Chinese question marks
  text = text.replace(/\{\{CHINESE_QUESTION_MARK\}\}/g, chineseQuestionMark);
  
  console.log("Cleaned text in cleanText:", text);
  return text;
}

function isPinyinWithTone(word) {
  return /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(word);
}

const pinyinSyllables = new Set(["a", "ai", "an", "ang", "ao", "ba", "bai", "ban", "bang", "bao", "bei", "ben", "beng", "bi", "bian", "biao",
  "bie", "bin", "bing", "bo", "bu", "ca", "cai", "can", "cang", "cao", "ce", "cen", "ceng", "cha", "chai", "chan",
  "chang", "chao", "che", "chen", "cheng", "chi", "chong", "chou", "chu", "chua", "chuai", "chuan", "chuang",
  "chui", "chun", "chuo", "ci", "cong", "cou", "cu", "cuan", "cui", "cun", "cuo", "da", "dai", "dan", "dang", "dao",
  "de", "dei", "den", "deng", "di", "dian", "diao", "die", "ding", "diu", "dong", "dou", "du", "duan", "dui", "dun",
  "duo", "e", "ei", "en", "eng", "er", "fa", "fan", "fang", "fei", "fen", "feng", "fo", "fou", "fu", "ga", "gai",
  "gan", "gang", "gao", "ge", "gei", "gen", "geng", "gong", "gou", "gu", "gua", "guai", "guan", "guang", "gui",
  "gun", "guo", "ha", "hai", "han", "hang", "hao", "he", "hei", "hen", "heng", "hong", "hou", "hu", "hua", "huai",
  "huan", "huang", "hui", "hun", "huo", "ji", "jia", "jian", "jiang", "jiao", "jie", "jin", "jing", "jiong", "jiu",
  "ju", "juan", "jue", "jun", "ka", "kai", "kan", "kang", "kao", "ke", "ken", "keng", "kong", "kou", "ku", "kua",
  "kuai", "kuan", "kuang", "kui", "kun", "kuo", "la", "lai", "lan", "lang", "lao", "le", "lei", "leng", "li", "lia",
  "lian", "liang", "liao", "lie", "lin", "ling", "liu", "lo", "long", "lou", "lu", "luan", "lue", "lun", "luo", "ma",
  "mai", "man", "mang", "mao", "me", "mei", "men", "meng", "mi", "mian", "miao", "mie", "min", "ming", "miu", "mo",
  "mou", "mu", "na", "nai", "nan", "nang", "nao", "ne", "nei", "nen", "neng", "ni", "nian", "niang", "niao", "nie",
  "nin", "ning", "niu", "nong", "nou", "nu", "nuan", "nue", "nuo", "o", "ou", "pa", "pai", "pan", "pang", "pao",
  "pei", "pen", "peng", "pi", "pian", "piao", "pie", "pin", "ping", "po", "pou", "pu", "qi", "qia", "qian", "qiang",
  "qiao", "qie", "qin", "qing", "qiong", "qiu", "qu", "quan", "que", "qun", "ran", "rang", "rao", "re", "ren", "reng",
  "ri", "rong", "rou", "ru", "rua", "ruan", "rui", "run", "ruo", "sa", "sai", "san", "sang", "sao", "se", "sen",
  "seng", "sha", "shai", "shan", "shang", "shao", "she", "shen", "sheng", "shi", "shou", "shu", "shua", "shuai",
  "shuan", "shuang", "shui", "shun", "shuo", "si", "song", "sou", "su", "suan", "sui", "sun", "suo", "ta", "tai",
  "tan", "tang", "tao", "te", "teng", "ti", "tian", "tiao", "tie", "ting", "tong", "tou", "tu", "tuan", "tui", "tun",
  "tuo", "wa", "wai", "wan", "wang", "wei", "wen", "weng", "wo", "wu", "xi", "xia", "xian", "xiang", "xiao", "xie",
  "xin", "xing", "xiong", "xiu", "xu", "xuan", "xue", "xun", "ya", "yan", "yang", "yao", "ye", "yi", "yin", "ying",
  "yo", "yong", "you", "yu", "yuan", "yue", "yun", "za", "zai", "zan", "zang", "zao", "ze", "zei", "zen", "zeng",
  "zha", "zhai", "zhan", "zhang", "zhao", "zhe", "zhen", "zheng", "zhi", "zhong", "zhou", "zhu", "zhua", "zhuai",
  "zhuan", "zhuang", "zhui", "zhun", "zhuo", "zi", "zong", "zou", "zu", "zuan", "zui", "zun", "zuo"]);

function isPinyinSequence(phrase) {
  const words = phrase.toLowerCase().trim().split(/\s+/);
  const valid = words.filter(word => pinyinSyllables.has(word));
  return valid.length >= 2 && valid.length === words.length;
}

function removeInlinePinyinPhrases(text) {
  console.log("🔍 Input text:", text);

  const toneRegex = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]/;

  // Capture pinyin phrases that can consist of multiple words
  const pinyinRegex = /[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]+(?:\s+[a-zA-ZüÜāáǎàēéěè...]+)*/g;

  const result = text.replace(pinyinRegex, (match) => {
    const cleaned = match.replace(/[,;:"'.]/g, '').trim();
    const toneCount = (cleaned.match(toneRegex) || []).length;

    console.log("👉 Checking:", match, "| Cleaned:", cleaned, "| Tone count:", toneCount);

    if (toneCount >= 1 || isPinyinSequence(cleaned)) {
      console.log("✅ Removing Pinyin phrase:", match);
      return '';
    }

    return match;
  });

  return result;
}

// Updated regex to include Chinese question mark
const hanziRegex = /[\u4e00-\u9fa5？]/;

function processTextToSegments(text) {
  console.log("Original text in processTextToSegments:", text);
  
  // Apply cleaning functions - using improved implementation
  text = cleanText(text);
  
  text = removeInlinePinyinPhrases(text);
  
  console.log("Cleaned text:", text);

  const segments = [];
  const letterRegex = /[a-zA-Z']/;
  const numberRegex = /[0-9]/;

  // Improved delimiter regex that includes Chinese question mark
  const sentenceDelimiters = /([.!?。！？；;][\s\n]?)/g;
  const sentences = text.split(sentenceDelimiters).filter(s => s.trim().length > 0);

  // Process each sentence with improved hanzi detection
  sentences.forEach((sentence) => {
    // Skip delimiters that got included in the split
    if (/^[.!?。！？；;]$/.test(sentence)) {
      return;
    }
    
    let buffer = '';
    // Use the updated hanziRegex that includes the Chinese question mark
    let currentLang = hanziRegex.test(sentence) ? 'zh' : 'en';

    for (let i = 0; i < sentence.length; i++) {
      const ch = sentence[i];
      // Also check for Chinese question mark in the character test
      const isHanzi = hanziRegex.test(ch);
      const isLetter = letterRegex.test(ch) || ch === ' ';
      const isNumber = numberRegex.test(ch);

      if (isHanzi && currentLang !== 'zh') {
        if (buffer.trim()) {
          segments.push({ lang: currentLang, content: buffer.trim() });
          buffer = '';
        }
        currentLang = 'zh';
      } else if ((isLetter || isNumber) && currentLang !== 'en') {
        if (buffer.trim()) {
          segments.push({ lang: currentLang, content: buffer.trim() });
          buffer = '';
        }
        currentLang = 'en';
      }
      buffer += ch;
    }

    if (buffer.trim()) {
      segments.push({ lang: currentLang, content: buffer.trim() });
    }
  });

  // Final fail-safe: ensure we have at least one segment
  if (segments.length === 0) {
    console.warn("No segments created, adding fallback segment");
    segments.push({ lang: 'en', content: text.trim() });
  }

  console.log("Final segments:", segments);
  return segments;
}

function escapeSSML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Final check for any remaining colons
    .replace(/:/g, ' ');
}

function generateSSML(text) {
  console.log("manggil processtexttosegment:", text);
  const segments = processTextToSegments(text);
  console.log("Segments:", segments);
  
  if (segments.length === 0) {
    console.error("No valid segments found for SSML generation");
    return ""; // Return empty SSML if no segments are found
  }

  console.log("Segments:", segments);
  const voiceMap = {
    en: 'en-US-JennyNeural',
    zh: 'zh-CN-XiaoyanNeural',
  };

  const ssmlParts = segments.map(seg => {
    const voice = voiceMap[seg.lang] || voiceMap.en;
    const rate = seg.lang === 'zh' ? '0.9' : '1.0';
    const escapedContent = escapeSSML(seg.content);
    console.log("Segment:", seg);
    console.log("Escaped Content:", escapedContent);
    return `<voice name="${voice}"><prosody rate="${rate}">${escapedContent}</prosody></voice>`;
  });

  const ssml = `
    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
      ${ssmlParts.join(' ')}
    </speak>
  `;
  console.log("Generated SSML:", ssml);
  return ssml;
}

function isLanguageSupported(text) {
  // Updated to include Chinese question mark
  return /[\u4e00-\u9fa5？]|[a-zA-Z]/.test(text);
}

router.post('/speak', async (req, res) => {
  const { text, language } = req.body;
  console.log("Backend received text:", text);
  if (!text) return res.status(400).json({ error: 'Text required' });

  

  if (!isLanguageSupported(text)) {
    return res.status(400).json({
      error: 'Language not supported',
      message: 'Only English, Chinese, or mixed content is supported'
    });
  }

  const speechKey = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!speechKey || !region) {
    return res.status(500).json({ error: 'Azure speech credentials missing' });
  }

  try {
    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, region);
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
    
    // Pre-clean the text, especially preserving Chinese question marks
    let cleanedText = text
      .replace(/^\uFEFF/, '')  // Remove BOM
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
      
    // Special handling for bracket content with Chinese question mark
    // Keep the question mark by not replacing or removing it
    cleanedText = cleanedText
      // Handle brackets with hanzi and question mark - preserve both
      .replace(/\(([一-龥]+)(？)\)/g, '($1$2)')
      // Handle "1. Dongcheng (东城):" pattern properly
      .replace(/(\d+\.\s*[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+\s*\([^\)]+\)):/g, '$1. ')
      // Fix "Beijing: 1." pattern
      .replace(/(\w+):(\s*\d+\.\s+)/g, '$1 $2')
      // Remove all remaining colons after specific patterns are handled
      .replace(/:/g, ' ');     
      
    console.log("Cleaned text before SSML generation:", cleanedText);
      
    const ssml = generateSSML(cleanedText);
    console.log("Generated SSML:", ssml);

    synthesizer.speakSsmlAsync(
      ssml,
      result => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.Canceled) {
          const cancellation = sdk.SpeechSynthesisCancellationDetails.fromResult(result);
          return res.status(500).json({ error: cancellation.errorDetails });
        }
        res.header('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(result.audioData));
      },
      err => {
        synthesizer.close();
        res.status(500).json({ error: err.message });
      }
    );
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;