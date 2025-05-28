import { createClient } from '@supabase/supabase-js';
import supabase from './supabaseClient';

// ✅ Call OpenAI with Mandarin topic restriction
export async function getMandarinTutorResponse(userInput, threadId, userId) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
    //  'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: userInput,
      threadId: threadId, // ← Make sure this is included
      userId: userId      // ← And this too
       
    })
  });

  const data = await response.json();
  return { content: data.content };
}