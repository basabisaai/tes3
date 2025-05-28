// backend/routes/ai.js — REFACTORED with persistent cooldown logic (real reset)
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const router = express.Router();

const MAX_TOKENS = parseInt(process.env.MAX_TOKENS_PER_PERIOD) || 1000;
const COOLDOWN_DURATION_MS = (parseInt(process.env.COOLDOWN_MINUTES) || 120) * 60 * 1000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY in environment');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const estimateTokens = (text) => Math.ceil(text.length / 4);

async function getOrCreateTokenUsage(userId) {
  const { data, error } = await supabase
    .from('token_usage')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;

  const now = new Date();

  if (data) {
    if (data.total_tokens >= MAX_TOKENS) {
      const lockedAt = new Date(data.locked_at);
      const unlockAt = new Date(lockedAt.getTime() + COOLDOWN_DURATION_MS);
      if (now < unlockAt) {
        const cooldownSecondsRemaining = Math.floor((unlockAt - now) / 1000);
        return { locked: true, cooldownSecondsRemaining };
      } else {
        // Reset usage after cooldown
        await supabase.from('token_usage').update({ total_tokens: 0, locked_at: null }).eq('id', data.id);
        return { locked: false, usageId: data.id, total_tokens: 0 };
      }
    }
    return { locked: false, usageId: data.id, total_tokens: data.total_tokens };
  } else {
    const { data: newRow } = await supabase.from('token_usage').insert({
      user_id: userId,
      total_tokens: 0,
      created_at: now.toISOString(),
      locked_at: null
    }).select().single();
    return { locked: false, usageId: newRow.id, total_tokens: 0 };
  }
}

async function addTokenUsage(userId, usageId, tokensUsed, totalTokensNow) {
  const updateFields = { total_tokens: totalTokensNow + tokensUsed };
  if (totalTokensNow + tokensUsed >= MAX_TOKENS) {
    updateFields.locked_at = new Date().toISOString();
  }
  await supabase.from('token_usage').update(updateFields).eq('id', usageId);
}

function createSummary(messages) {
  const earlyMessages = messages.slice(0, -10); // ambil semua kecuali 10 terakhir
  const summaryLines = earlyMessages
    .filter(m => m.role === 'assistant')
    .map(m => `• ${m.content.slice(0, 100).replace(/\n/g, ' ')}...`);
  return `Summary of earlier conversation:\n${summaryLines.join('\n')}`;
}

router.post('/tutor', async (req, res) => {
  const { input, threadId, userId } = req.body;
  if (!input || !threadId || !userId) return res.status(400).json({ error: 'Missing input, threadId or userId' });

  try {
    const tokenStatus = await getOrCreateTokenUsage(userId);
    if (tokenStatus.locked) {
      return res.status(429).json({
        error: 'You’ve used all your tokens for this session.',
        cooldownSecondsRemaining: tokenStatus.cooldownSecondsRemaining
      });
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .eq('is_canceled', false)
      .order('created_at', { ascending: true });

    const { data: insertedMessage } = await supabase.from('messages').insert([
      { thread_id: threadId, role: 'user', content: input, version: 'v1.0', is_canceled: false }
    ]).select();

    await new Promise((resolve) => setTimeout(resolve, 700));

    const { data: recheck } = await supabase
      .from('messages')
      .select('is_canceled')
      .eq('id', insertedMessage[0].id)
      .single();

    if (recheck?.is_canceled === true) return res.json({ content: '' });

const MAX_MESSAGES = 10;
let contextMessages = [];

if (messages.length > MAX_MESSAGES) {
  const summary = createSummary(messages); // fungsi ini udah kamu tambah di atas
  contextMessages = [
    { role: 'system', content: summary }, // ringkasan pesan awal
    ...messages.slice(-MAX_MESSAGES).map(msg => ({
      role: msg.role,
      content: msg.content
    }))
  ];
} else {
  contextMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}

contextMessages.push({ role: 'user', content: input });


    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `
            You are a Mandarin tutor. Your task is to:
            1. Only respond to questions related to Mandarin learning (e.g., vocabulary, grammar, pronunciation, cultural context)
            2. Correct grammar, spelling, and punctuation when the user makes mistakes
            3. Provide short, natural usage examples when applicable
            4. Reject off-topic questions (e.g., politics, quantum physics, coding)
            5. Do not answer questions unrelated to Mandarin
            6. If the question is not clear, ask the user to clarify

            PINYIN & HANZI FORMATTING RULES:
            - Always provide pinyin *with tone marks over vowels* (ā, á, ǎ, à)
            - Never use numeric tone format (e.g., ni3 hao3 ❌)
            - Every pinyin must be followed by its hanzi in parentheses
              Example: nǐ hǎo (你好)
            - If the user provides only pinyin, add the hanzi after
            - If the user provides hanzi, add the pinyin in parentheses

            RESPONSE STRUCTURE:
            - Keep each sentence concise (max 100 characters)
            - Use paragraph breaks to separate ideas
            - Use bullet points only for structured lists (e.g., vocabulary sets)
            - Avoid large blocks of unbroken text

            GOAL:
            - Help the user understand Mandarin patterns, grammar, and pronunciation
            - Teach in a friendly, encouraging tone
            - Use simple English if user input is in English
            - Avoid over-explaining; aim for clarity not complexity
          `
        },
        ...contextMessages
      ]
    });

    const assistantReply = completion.choices[0].message.content;

    await supabase.from('messages').insert([
      { thread_id: threadId, role: 'assistant', content: assistantReply, version: 'v1.0' }
    ]);

    const inputTokenCount = estimateTokens(input);
    const outputTokenCount = estimateTokens(assistantReply);
    await addTokenUsage(userId, tokenStatus.usageId, inputTokenCount + outputTokenCount, tokenStatus.total_tokens);

    await supabase
      .from('threads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', threadId);

    res.json({ content: assistantReply });
  } catch (err) {
    console.error('🔥 BACKEND ERROR:', err.message);
    res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
});

router.get('/tutor/token-status', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    const tokenStatus = await getOrCreateTokenUsage(userId);
    return res.json({
      isLimited: tokenStatus.locked,
      cooldownSecondsRemaining: tokenStatus.cooldownSecondsRemaining || 0
    });
  } catch (err) {
    console.error('Token status check failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/generate-thread-title', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are an assistant who writes short and accurate thread titles. Based on the user's first message, return a max 5-word title.`
        },
        { role: 'user', content: message }
      ]
    });

    const title = completion.choices[0].message.content.trim();
    res.json({ title });
  } catch (error) {
    console.error('OpenAI error:', error.message);
    res.status(500).json({ error: 'Failed to generate thread title' });
  }
});

module.exports = router;
