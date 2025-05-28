// src/utils.js
export function parseTextSegments(text) {
    const segments = [];
    let buffer = '';
    let currentLanguage = null;
  
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const isHanzi = /[\u4e00-\u9fa5]/.test(char);
      const isParen = char === '(' || char === ')';
  
      if (isHanzi) {
        if (currentLanguage === 'english' && buffer.trim()) {
          segments.push({ lang: 'english', content: buffer });
          buffer = '';
        }
        currentLanguage = 'chinese';
        buffer += char;
      } else if (isParen) {
        continue;
      } else if (char === '(') {
        if (currentLanguage === 'english' && buffer.trim()) {
          segments.push({ lang: 'english', content: buffer });
          buffer = '';
        }
        currentLanguage = 'pinyin';
        buffer += char;
      } else if (char === ')' && currentLanguage === 'pinyin') {
        buffer += char;
        const pinyin = buffer.slice(1, -1);
        segments.push({ lang: 'pinyin', content: pinyin });
        buffer = '';
        currentLanguage = null;
      } else {
        if (currentLanguage === 'pinyin') {
          buffer += char;
        } else {
          if (currentLanguage === 'chinese' && buffer.trim()) {
            segments.push({ lang: 'chinese', content: buffer });
            buffer = '';
          }
          currentLanguage = 'english';
          buffer += char;
        }
      }
    }
  
    if (buffer.trim()) {
      if (currentLanguage === 'english') {
        segments.push({ lang: 'english', content: buffer });
      } else if (currentLanguage === 'chinese') {
        segments.push({ lang: 'chinese', content: buffer });
      }
    }
  
    return segments;
  }