import { useState, useEffect, useRef } from 'react';
import supabase from './supabaseClient';
import { speakText, stopAllAudio } from './azureTTS';
import { startRecording } from './azureASR'; // Sesuaikan path jika diperlukan

export default function ChatWindow({ threadId, onCreateThreadWithAutonaming }) {
  const [messages, setMessages] = useState([]);
  const nonCanceledMessages = messages.filter((msg) => !msg.is_canceled);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [detectedLang, setDetectedLang] = useState(null);
  const [messageLangs, setMessageLangs] = useState({});
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingFeedback, setRecordingFeedback] = useState('');
  const [lastInputWasVoice, setLastInputWasVoice] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showStopButton, setShowStopButton] = useState(false);
  const [isFreshNewThread, setIsFreshNewThread] = useState(false);
  const [tokenStatusLoading, setTokenStatusLoading] = useState(true);
  const [tokenLimitReached, setTokenLimitReached] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [userId, setUserId] = useState(null);
  const currentRequestIdRef = useRef(null);
  

  const formatTime = (seconds) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

  useEffect(() => {
    console.log("✅ useEffect [userId] triggered, userId:", userId);
    if (!userId) return;
    setTokenStatusLoading(true);
    checkTokenStatus(userId);
  }, [userId]);


  const startCooldownTimer = () => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current);
          setTokenLimitReached(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

 const checkTokenStatus = async (userId) => {
  console.log("🔍 Running checkTokenStatus for userId:", userId);
  try {
    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/token-status?userId=${userId}`);
    const status = await res.json();

    if (status.isLimited) {
      setTokenLimitReached(true);
      setCooldownRemaining(status.cooldownSecondsRemaining || 7200);
      startCooldownTimer();
    } else {
      setTokenLimitReached(false);
    }
  } catch (err) {
    console.error("Token check failed:", err);
  } finally {
    setTokenStatusLoading(false);
  }
};



useEffect(() => {
 const fetchAndCheckStatus = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await checkTokenStatus(user.id); // ← kirim user ID langsung ke fungsi
  }
 };

  fetchAndCheckStatus();
  }, []);
  const isNewThread = isFreshNewThread || nonCanceledMessages.length === 0; // 🔥 Logika Baru!
  const [draftMessages, setDraftMessages] = useState({});
  const [isCancelling, setIsCancelling] = useState(false);
  const [showVoiceConfirmModal, setShowVoiceConfirmModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const abortControllerRef = useRef(null);
  const pendingMessageRef = useRef(null); // To track the user message that was just sent
  const [currentTypingMessage, setCurrentTypingMessage] = useState(null);
  const [displayedContent, setDisplayedContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingSpeed = 15; // milliseconds per character
  const audioRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const messageEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const cooldownTimerRef = useRef(null);

   
  

  // Reset isFreshNewThread ketika pesan pertama muncul
  useEffect(() => {
    if (messages.length > 0) {
      setIsFreshNewThread(false);
    }
  }, [messages]);
  

  // Fetch user data (not currently used)
  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        // Not needed yet
      }
    };
    fetchUser();
  }, []);

  // Fetch messages and subscribe to real-time updates
  useEffect(() => {
    const fetchMessages = async () => {
        if (!threadId) return;
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('thread_id', threadId)
            .eq('is_canceled', false) // Add this line to filter out canceled messages
            .order('created_at', { ascending: true });
        if (error) {
            console.error('Failed to fetch messages:', error.message);
            setError("Chat history cannot be loaded, please refresh the page");
        } else {
            setMessages(data || []);
            for (const msg of data || []) {
                if (msg.role === 'assistant') {
                    await checkMessageLanguage(msg.content, msg.id);
                }
            }
            setError(null);
        }
    };
    fetchMessages();
    const channel = supabase
        .channel('chat-messages-channel')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `thread_id=eq.${threadId}`,
            },
            async (payload) => {
              if (!payload.new.is_canceled) {
                setMessages((prev) => [...prev, payload.new]);
                
                // For assistant messages, check if TTS should be activated
                if (payload.new.role === 'assistant') {
                    simulateTyping(payload.new); // Start typing animation
                    const isSupported = await checkMessageLanguage(payload.new.content, payload.new.id);
                    
                    // Add debug logging
                    console.log("Real-time message received, voice mode:", lastInputWasVoice, "language supported:", isSupported);
                    
                    if (lastInputWasVoice && isSupported) {
                        // Increase delay for more reliable playback
                        setTimeout(() => {
                            console.log("Starting TTS playback from real-time update");
                            handlePlayPronunciation(payload.new.content, payload.new.id);
                        }, 800);
                    }
                }
                
              }
              
            }
        )
         .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
      filter: `thread_id=eq.${threadId}`,
    },
    (payload) => {
      const updatedMessage = payload.new;

      setMessages((prevMessages) => {
        if (updatedMessage.is_canceled) {
          return prevMessages.filter((msg) => msg.id !== updatedMessage.id);
        }

        return prevMessages.map((msg) =>
          msg.id === updatedMessage.id ? updatedMessage : msg
        );
      });
    }
  )
        .subscribe();

    

    // Reset textarea height when thread changes
    const textarea = document.querySelector('textarea');
    if (textarea) {
        textarea.style.height = '40px'; // Reset to default height
    }

    return () => supabase.removeChannel(channel);
}, [threadId, lastInputWasVoice]); // Add lastInputWasVoice as a dependency

 // Tambahkan useEffect ini untuk mereset input saat threadId berubah
 useEffect(() => {
  // Load any saved draft for this thread
  if (threadId) {
    const savedDraft = draftMessages[threadId] || '';
    setInput(savedDraft);
  } else {
    setInput('');
  }
  
  setDetectedLang(null);
  
  // Reset textarea height
  const textarea = document.querySelector('textarea');
  if (textarea) {
    textarea.style.height = '40px'; // Reset to default height
    
    // If there's saved content, resize the textarea accordingly
    if (draftMessages[threadId]) {
      setTimeout(() => {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
      }, 0);
    }
  }
}, [threadId, draftMessages]);
  // Scroll to bottom when messages or loading state changes
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Cleanup audio and timers on unmount
  useEffect(() => {
    return () => {
      stopAllAudio();
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
    };
  }, []);

  //check utk token habis notif
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setTokenStatusLoading(true); // tambahkan ini agar UI nunggu
        await checkTokenStatus(session.user.id);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
      }
    });

    // Cek langsung juga, bukan hanya nunggu perubahan
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) {
        setUserId(data.user.id);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

   // Check if a message's language is supported
  const checkMessageLanguage = async (text, messageId) => {
    try {
      const DETECT_URL = import.meta.env.VITE_BACKEND_LANG_URL || 'http://localhost:3000/api/langdetect';
      const response = await fetch(DETECT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Language detection failed");
      setMessageLangs(prev => ({
        ...prev,
        [messageId]: {
          isSupported: data.isSupported,
          language: data.language,
        },
      }));
      return data.isSupported;
    } catch (err) {
      console.error("Language Detection Error:", err.message);
      return false;
    }
  };
// Function to cancel the ongoing request
// Modified cancel function in ChatWindow component
const cancelRequest = async () => {
  setIsCancelling(true);
  try {
    // 1. Abort any ongoing fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 2. Remove pending message from UI and mark as canceled
    if (pendingMessageRef.current) {
      const msgId = pendingMessageRef.current;

      // Remove from UI
      setMessages((prev) => prev.filter(msg => msg.id !== msgId));

      // Update Supabase to mark as canceled
      await supabase
        .from('messages')
        .update({ 
          is_canceled: true,
          content: '[Message canceled by user]'
        })
        .eq('id', msgId);
      // 👇 Optional cleanup logic
const { data: remainingMsgs } = await supabase
  .from('messages')
  .select('id')
  .eq('thread_id', threadId)
  .eq('is_canceled', false);

if (!remainingMsgs || remainingMsgs.length === 0) {
  await supabase
    .from('threads')
    .delete()
    .eq('id', threadId);
}
      pendingMessageRef.current = null;
    }
  } catch (err) {
    console.error('Error during cancellation:', err.message);
  } finally {
    setLoading(false);
    setIsCancelling(false);
    setError(null);
    currentRequestIdRef.current = null; // ⬅️ Tambahan penting
  }
};


const simulateTyping = (message) => {
  setIsTyping(true);
  setCurrentTypingMessage(message.id);
  setDisplayedContent('');

  let i = 0;
  const content = message.content;

  const typingInterval = setInterval(() => {
    if (i < content.length) {
      setDisplayedContent(prev => prev + content.charAt(i));
      i++;
    } else {
      clearInterval(typingInterval);
      setIsTyping(false);
      setCurrentTypingMessage(null);
    }
  }, typingSpeed);

  return () => clearInterval(typingInterval); // Cleanup interval
};

  // Detect input language
  const detectLanguage = async (text) => {
    try {
      const DETECT_URL = import.meta.env.VITE_BACKEND_LANG_URL || 'http://localhost:3000/api/langdetect';
      const response = await fetch(DETECT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Language detection failed");
      setDetectedLang(data.language);
    } catch (err) {
      console.error("Input Language Detection Error:", err.message);
      setDetectedLang(null);
    }
  };

  // Handle input change
  const handleInputChange = async (e) => {
  const value = e.target.value;
  setInput(value);

  // Reset voice flag when user starts typing
  if (lastInputWasVoice) {
    setLastInputWasVoice(false);
  }
  
  // Save this draft to the draftMessages object
  if (threadId) {
    setDraftMessages(prev => ({
      ...prev,
      [threadId]: value
    }));
  }

  // Auto-expand textarea height
  const textarea = e.target;
  textarea.style.height = 'auto'; // Reset height to recalculate
  textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`; // Max height 150px

  // Auto-scroll if content exceeds maxHeight
  if (textarea.scrollHeight > 150) {
    textarea.scrollTop = textarea.scrollHeight; // Scroll to bottom
  }

  if (value.trim().length > 0) {
    await detectLanguage(value);
  } else {
    setDetectedLang(null);
  }
  setLastInputWasVoice(false);
};

  // Send text message
  const sendMessage = async () => {
    console.log("sendMessage function triggered");
    if (!input.trim()) return;

    console.log("Original content received in sendMessage :", input);

    setLoading(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert("Please log in first!");

    // Get current thread ID from props
    const currentThreadId = threadId;

    // Make sure we have a thread ID
    if (!currentThreadId) {
      console.error("No thread ID found");
      return;
    }
    // Create a temporary ID for the pending message
    const tempId = `temp-${Date.now()}`;
    const userMessage = {
      role: 'user',
      content: input,
      thread_id: currentThreadId,
      created_at: new Date(),
    };

    // Save reference to the pending message
    pendingMessageRef.current = tempId;
    // Add to local state first
    setMessages(prev => [...prev, { ...userMessage, id: tempId }]);

      // Log untuk memastikan teks yang dikirim ke backend TTS
    console.log("Final text sent to backend tts:", input);

    // Hapus id sebelum kirim ke Supabase
    const { id, ...messageToSend } = userMessage;
     // Send to database
    const { data: insertedMessage, error } = await supabase
      .from('messages')
      .insert(userMessage)
      .select();

    if (error) {
      console.error("Supabase insert error:", error.message);
    } else if (insertedMessage && insertedMessage.length > 0) {
    const serverId = insertedMessage[0].id;

  // Update local state dengan server ID sebenarnya
  setMessages(prev => prev.map(msg => 
    msg.id === tempId ? insertedMessage[0] : msg
  ));

  pendingMessageRef.current = serverId;
}
    const { error: threadError } = await supabase
        .from('threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', threadId);
    if (threadError) {
        console.error('Error updating thread timestamp:', threadError);
    }
    setLoading(true);

    const requestId = Date.now();
    currentRequestIdRef.current = requestId;
    try {
        // Create a new AbortController
    
        
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/api/ai/tutor';
        console.log("Content being sent to backend AI Tutor zz:", input);

        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              input: input,
              threadId: currentThreadId,   // ← Add this
              userId: user.id              // ← And this
            }),
             signal // Add this line
        });
        let data;
try {
  data = await response.json();
  console.log("Response received from backend AI Tutor zz:", data);
} catch (parseError) {
  data = {}; // Jika balasan bukan JSON (misalnya server crash)
}

if (!response.ok) {
  let errorMessage = "AI Tutor is temporarily unavailable. Please try again later.";
  
 if (response.status === 429 && data.error) {
   //const data = await response.json();

    // Prioritize cooldownSecondsRemaining dari backend
    const cooldownSeconds = data.cooldownSecondsRemaining || 7200;

    errorMessage = data.error || `Message limit reached. Please wait ${Math.floor(cooldownSeconds / 60)} minutes.`;
    
    setTokenLimitReached(true);
    setCooldownRemaining(cooldownSeconds);
    startCooldownTimer();
    setError(errorMessage);
    return;
 }
  

  setError(errorMessage);
  throw new Error(errorMessage);
}

if (currentRequestIdRef.current !== requestId) {
  console.warn("Outdated response ignored (text input)");
  return;
}
        const aiMessage = {
            role: 'assistant',
            content: data.content,
            thread_id: currentThreadId,
            created_at: new Date(),
        };
        console.log("AI message content before adding to messages state zz:", data.content);
        const { data: insertData, error: insertError } = await supabase
            .from('messages')
            .insert(aiMessage)
            .select();
        if (insertError) {
            setMessages((prev) => [...prev, aiMessage]);
        } else if (insertData && insertData.length > 0) {
            setMessages((prev) => [...prev, insertData[0]]);
            simulateTyping(insertData[0]);
            const isSupported = await checkMessageLanguage(insertData[0].content, insertData[0].id);
            if (lastInputWasVoice && isSupported) {
                setTimeout(() => handlePlayPronunciation(insertData[0].content, insertData[0].id), 500);
            }
        }
        setError(null);
        // NEW LOGIC: Autoname the thread if it's the first message
        if (messages.length === 0 && onCreateThreadWithAutonaming) {
            const sanitizedInput = input.trim().replace(/^"|"$/g, ''); // Remove leading/trailing quotes
            onCreateThreadWithAutonaming(sanitizedInput);
        }
    } catch (err) {
        console.error('AI Tutor Error:', err.message);
        if (err.name !== 'AbortError') {
      setError("AI Tutor is temporarily unavailable. Please try again later.");
    }
    } finally {
        setLoading(false);
        setInput('');
          if (threadId) {
            setDraftMessages(prev => {
          const newDrafts = {...prev};
          delete newDrafts[threadId];
          return newDrafts;
        });
      }
        setDetectedLang(null);
        // Reset textarea height
        const textarea = document.querySelector('textarea');
        if (textarea) {
            textarea.style.height = '40px'; // Reset to default height
        }
    }
};

  // Send voice-to-text message
  const sendMessageWithContent = async (content, isVoiceInput = false) => {

  
  console.log("sendMessageWithContent function triggered");
  if (!content.trim()) return;
  console.log("Original content received in sendMessageWithContent:", content);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return alert("Please log in first!");

  const currentThreadId = threadId;

  if (!currentThreadId) {
    console.error("No thread ID found");
    return;
  }
  // Ensure voice flag is explicitly set if provided
  if (isVoiceInput) {
    setLastInputWasVoice(true);
  }

  // Create a temporary ID for the pending message
 const tempId = `temp-${Date.now()}`;
const userMessage = {
  role: 'user',
  content: content,
  thread_id: currentThreadId,
  created_at: new Date(),
};

    // Save reference to the pending message
  pendingMessageRef.current = tempId;
  setMessages(prev => [...prev, { ...userMessage, id: tempId }]);

     // Log untuk memastikan teks yang dikirim ke backend TTS
  console.log("Final text sent to backend tts 123:", content);
  const { id, ...messageToSend } = userMessage;
 const { data: insertedMessage, error } = await supabase
  .from('messages')
  .insert(userMessage)
  .select();

if (error) {
  console.error("Supabase insert error:", error.message);
} else if (insertedMessage && insertedMessage.length > 0) {
  const serverId = insertedMessage[0].id;

  // Update local state dengan server ID sebenarnya
  setMessages(prev => prev.map(msg => 
    msg.id === tempId ? insertedMessage[0] : msg
  ));

  pendingMessageRef.current = serverId;
}

  const { error: threadError } = await supabase
    .from('threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', threadId);
  if (threadError) {
    console.error('Error updating thread timestamp:', threadError);
  }

  setLoading(true);
  const requestId = Date.now(); // bikin ID unik
  currentRequestIdRef.current = requestId; // simpan ID sekarang
  try {

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/api/ai/tutor';
    console.log("Content being sent to backend AI Tutor:", content);
      const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
      input: content,
      threadId: currentThreadId,
      userId: user.id
    }),
     signal // Add this line
    });
    let data;
try {
  data = await response.json();
  console.log("Response received from backend AI Tutor:", data);
} catch (parseError) {
  data = {}; // Jika balasan bukan JSON (misalnya server crash)
}

if (!response.ok) {
  let errorMessage = "AI Tutor is temporarily unavailable. Please try again later.";

   if (response.status === 429 && data.error) {
   //const data = await response.json();

    // Prioritize cooldownSecondsRemaining dari backend
    const cooldownSeconds = data.cooldownSecondsRemaining || 7200;

    errorMessage = data.error || `Message limit reached. Please wait ${Math.floor(cooldownSeconds / 60)} minutes.`;
    
    setTokenLimitReached(true);
    setCooldownRemaining(cooldownSeconds);
    startCooldownTimer();
    setError(errorMessage);
    return;
 }

  setError(errorMessage);
  throw new Error(errorMessage);
}

if (currentRequestIdRef.current !== requestId) {
  console.warn("Outdated response ignored (text input)");
  return;
}

    const aiMessage = {
      role: 'assistant',
      content: data.content,
      thread_id: currentThreadId,
      created_at: new Date(),
    };
console.log("AI message content before adding to messages state:", data.content);
    const { data: insertData, error: insertError } = await supabase
      .from('messages')
      .insert(aiMessage)
      .select();
    
    // Check lastInputWasVoice still has the right value (debugging)
    console.log("Voice mode active before handling response:", isVoiceInput, lastInputWasVoice);
    
    if (insertError) {
      setMessages((prev) => [...prev, aiMessage]);
    } else if (insertData && insertData.length > 0) {
      setMessages((prev) => [...prev, insertData[0]]);
      simulateTyping(insertData[0]);
      console.log("Message content being checked for language support:", insertData[0].content);
      const isSupported = await checkMessageLanguage(insertData[0].content, insertData[0].id);
      
      // CRITICAL: Use the isVoiceInput parameter directly and also check lastInputWasVoice
      // This ensures we don't lose the voice state during async operations
      if ((isVoiceInput || lastInputWasVoice) && isSupported) {
        console.log("Activating TTS because voice input was detected");
        // Increase delay to ensure UI is ready
        setTimeout(() => handlePlayPronunciation(insertData[0].content, insertData[0].id), 800);
      } else {
        console.log("Not activating TTS, voice not detected or language not supported");
      }
    }

    setError(null);
  pendingMessageRef.current = null;
    // NEW LOGIC: Autoname the thread if it's the first message
    if (messages.length === 0 && onCreateThreadWithAutonaming) {
      const sanitizedContent = content.trim().replace(/^"|"$/g, ''); // Remove leading/trailing quotes
      onCreateThreadWithAutonaming(sanitizedContent);
    }
  } catch (err) {
    console.error('AI Tutor Error:', err.message);
     if (err.name !== 'AbortError') {
      setError("AI Tutor is temporarily unavailable. Please try again later.");
    }
  } finally {
    setLoading(false);
    setInput('');
    if (threadId) {
      setDraftMessages(prev => {
        const newDrafts = {...prev};
        delete newDrafts[threadId];
        return newDrafts;
      });
    }
    setDetectedLang(null);
    
    // IMPORTANT: Don't reset lastInputWasVoice here to preserve it for the response handler
    // We'll let the next text input or next voice input reset this state instead
  }
};

  // Handle voice input
const handleVoiceInput = async () => {
  if (isRecording) return;

  const skipPopup = localStorage.getItem('voiceWarningAccepted') === 'true';

  if (skipPopup) {
    startRecordingProcess(); // langsung mulai
  } else {
    setShowVoiceConfirmModal(true); // tampilkan popup
  }
};

const startRecordingProcess = async () => {
  setIsRecording(true);
  setRecordingFeedback('Initializing...');
  
  if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
  recordingTimeoutRef.current = setTimeout(() => {
    setIsRecording(false);
    setRecordingFeedback('');
    setError("Recording timed out. Please try again.");
  }, 20000);

  try {
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach(track => track.stop());
    setRecordingFeedback('🎤 Recording... (Auto-detect)');
    const result = await startRecording('auto');
    const speechText = result.text;
    const detectedLanguage = result.language;
    if (speechText && speechText.trim()) {
      const langName = detectedLanguage === 'zh-CN' ? 'Mandarin' : 'English';
      setRecordingFeedback(`✓ Success! (${langName})`);
      setDetectedLang(detectedLanguage);
      setLastInputWasVoice(true);
      setTimeout(() => {
        setRecordingFeedback('');
        setInput(speechText);
        setTimeout(() => {
          sendMessageWithContent(speechText, true);
        }, 300);
      }, 1000);
    } else {
      throw new Error("No speech detected. Please try speaking more clearly.");
    }
  } catch (err) {
    setError(`Speech error: ${err.message}`);
    setRecordingFeedback('');
  } finally {
    setIsRecording(false);
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  }
};
  // Stop current audio playback
  const stopCurrentAudio = () => {
    stopAllAudio();
    setAudioPlaying(false);
    setCurrentlyPlayingId(null);
    setShowStopButton(false);
  };

  // Play pronunciation using TTS
  const handlePlayPronunciation = async (text, messageId) => {
    console.log("Text received in handlePlayPronunciation:", text); // Log the text
    stopCurrentAudio();
    setShowStopButton(true);
    if (audioPlaying) return;

    try {
      setAudioPlaying(true);
      setCurrentlyPlayingId(messageId);
      const statusElement = document.getElementById(`tts-status-${messageId}`);
      const detectedLang = messageLangs[messageId]?.language || 'en-US';
      await speakText(text, detectedLang);
    } catch (err) {
      console.error('TTS Error during playback:', err.message);
      alert("Pronunciation playback failed: " + err.message);
    } finally {
      setAudioPlaying(false);
      setCurrentlyPlayingId(null);
      const statusElement = document.getElementById(`tts-status-${messageId}`);
      if (statusElement) statusElement.textContent = '';
    }
  };

  // Check if speaker is enabled for a message
  const isSpeakerEnabled = (msgId) => {
    return messageLangs[msgId]?.isSupported === true;
  };

  // Get tooltip for speaker button
  const getSpeakerTooltip = (msgId) => {
    if (!messageLangs[msgId]) return "Voice playback not available";
    return messageLangs[msgId].isSupported
      ? "Play pronunciation"
      : "Voice playback only available for Mandarin and English";
  };

  // Copy message to clipboard
  const copyToClipboard = (text, buttonId) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById(buttonId);
        btn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>`;
        btn.disabled = true;
        setTimeout(() => {
          const originalIcon = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>`;
          btn.innerHTML = originalIcon;
          btn.disabled = false;
        }, 1000);
      }).catch(() => fallbackCopyTextToClipboard(text, buttonId));
    } else {
      fallbackCopyTextToClipboard(text, buttonId);
    }
  };

  // Fallback for copying text to clipboard
  const fallbackCopyTextToClipboard = (text, buttonId) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.width = "2em";
    textArea.style.height = "2em";
    textArea.style.border = "none";
    textArea.style.outline = "none";
    textArea.style.boxShadow = "inset 0 0 0 9999px #fff";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      const btn = document.getElementById(buttonId);
      if (successful) {
        btn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>`;
        btn.disabled = true;
        setTimeout(() => {
          const originalIcon = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>`;
          btn.innerHTML = originalIcon;
          btn.disabled = false;
        }, 1000);
      }
    } catch (err) {
      alert('Failed to copy message.');
    }
    document.body.removeChild(textArea);
  };

  // Handle keydown for sending message
const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
        if (e.shiftKey) {
            // Shift + Enter: Add new line
            e.preventDefault();
            
            // Get current cursor position
            const cursorPosition = e.target.selectionStart;
            
            // Update input with new line
            const newValue = input.slice(0, cursorPosition) + '\n' + input.slice(cursorPosition);
            setInput(newValue);
            
            // After state update, need to restore cursor position in the next render cycle
            setTimeout(() => {
                const textarea = document.querySelector('textarea');
                if (textarea) {
                    // Set cursor position after the new line
                    textarea.selectionStart = cursorPosition + 1;
                    textarea.selectionEnd = cursorPosition + 1;
                    
                    // Make sure it's visible by forcing scroll
                    textarea.scrollTop = textarea.scrollHeight;
                    
                    // Recalculate height
                    textarea.style.height = 'auto';
                    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
                    
                    // If at max height, make sure cursor is visible
                    if (textarea.scrollHeight > 150) {
                        textarea.scrollTop = textarea.scrollHeight;
                    }
                    
                    // Keep focus on the textarea
                    textarea.focus();
                }
            }, 0);
        } else if (input.trim() && !loading && !isRecording) {
            // Regular Enter: Send message
            e.preventDefault(); // Prevent default behavior (new line)
            setLastInputWasVoice(false);
            sendMessage();
        }
    }
};

// Handle send button click
const handleSendClick = () => {
    if (!input.trim()) {
        alert("Message cannot be empty!");
        return;
    }
    
    if (loading || isRecording) {
        console.warn("Cannot send message while loading or recording.");
        return;
    }
    
    // Make sure textarea is focused and scrolled to bottom before sending
    const textarea = document.querySelector('textarea');
    if (textarea) {
        textarea.focus();
        textarea.scrollTop = textarea.scrollHeight;
    }
    
    // Small delay to ensure the UI state is updated properly
    setTimeout(() => {
        setLastInputWasVoice(false);
        sendMessage();
    }, 0);
};

  // Show scroll button if user scrolls up
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const checkScrollPosition = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNotAtBottom = scrollTop + clientHeight < scrollHeight - 20;
      setShowScrollButton(isNotAtBottom);
    };

    checkScrollPosition();
    if (messages.length > 0) {
      setTimeout(checkScrollPosition, 300);
    }

    container.addEventListener('scroll', checkScrollPosition);
    return () => {
      container.removeEventListener('scroll', checkScrollPosition);
    };
  }, [messages]);

  // Scroll to bottom
  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  };
  if (tokenStatusLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-lg">
        Loading access status...
      </div>
    );
  }
  return (
    <div className="flex flex-col h-full bg-white pt-[120px]">
      

          {/* 🔥 NOTIFIKASI LIMIT TOKEN DITAMBAHKAN DI SINI 🔥 */}
  {tokenLimitReached && (
    <div className="absolute top-0 left-0 right-0 z-50 flex justify-center">
      <div className="w-full md:max-w-[900px] bg-blue-50 border-b border-blue-500 text-blue-800 px-4 py-3 shadow-md">
        <p className="text-sm md:text-base leading-relaxed text-center">
          Hey, thanks for the hustle! 😎 You've hit your token limit.
          <strong> Come back in {formatTime(cooldownRemaining)} </strong>
          to unlock new stuff! In the meantime, feel free to review your past lessons — you got this!
        </p>
      </div>
    </div>
  )}

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3 relative">
        {nonCanceledMessages.map((msg) => {
          const copyButtonId = `copy-btn-${msg.id}`;
          const isAssistant = msg.role === 'assistant';

          const isCurrentlyTyping = isTyping && currentTypingMessage === msg.id;
          return (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}>
              <div className="max-w-[85%] relative group">
                <div className={`relative px-3 py-2 ${
                  msg.role === 'user' ? 'bg-slate-100 text-gray-800 rounded-lg' : 'text-gray-800'
                }`}>
                <div className="whitespace-pre-wrap text-lg md:text-sm">
                  {isCurrentlyTyping ? displayedContent : msg.content}
                  {isCurrentlyTyping && <span className="typing-cursor">|</span>}
                </div>
                  {isAssistant && messageLangs[msg.id] && (
                    <div className="text-xs text-gray-500 mt-1">
                      {messageLangs[msg.id].language === 'zh-CN' ? 'Mandarin' : 'English'}
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <button
                    id={copyButtonId}
                    onClick={() => copyToClipboard(msg.content, copyButtonId)}
                    title="Copy message"
                    className="absolute right-[-1px] bottom-[-4px] text-gray-600 hover:text-blue-500 p-1 rounded-full hover:bg-gray-100 transition-all duration-200 z-10"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                    </svg>
                  </button>
                )}
                {isAssistant && (
                  <div className="absolute bottom-0 left-[5px] transform translate-y-1/2 flex items-center space-x-1 z-10">
                    <button
                      id={copyButtonId}
                      onClick={() => copyToClipboard(msg.content, copyButtonId)}
                      title="Copy message"
                      className="text-gray-500 hover:text-blue-500 p-1 rounded-full hover:bg-gray-50 transition-all duration-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                           fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                      </svg>
                    </button>
                    <button
                      onClick={() => isSpeakerEnabled(msg.id) && !audioPlaying &&
                        handlePlayPronunciation(msg.content, msg.id)}
                      disabled={!isSpeakerEnabled(msg.id) || audioPlaying}
                      title={getSpeakerTooltip(msg.id)}
                      aria-label={getSpeakerTooltip(msg.id)}
                      className={`rounded-full p-1 transition-all duration-200
                        ${currentlyPlayingId === msg.id
                          ? 'text-blue-600 animate-pulse'
                          : !isSpeakerEnabled(msg.id)
                            ? 'text-gray-300'
                            : audioPlaying
                              ? 'text-gray-400'
                              : 'text-gray-500 hover:text-blue-500 hover:bg-gray-50'
                        }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                           fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                      </svg>
                    </button>
                    {showStopButton && currentlyPlayingId === msg.id && (
                      <button
                        onClick={() => {
                          stopCurrentAudio();
                          setShowStopButton(false);
                        }}
                        className="ml-1 rounded-full p-1 text-red-500 hover:text-red-700 hover:bg-red-50 transition-all duration-200"
                        title="Stop pronunciation"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                             fill="currentColor">
                          <rect x="6" y="6" width="12" height="12" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
                <span id={`tts-status-${msg.id}`} className="text-[10px] text-gray-500 ml-auto mr-2 mt-1"></span>
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex items-start mb-2">
            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs mr-2">B</div>
            <div className="bg-white text-gray-500 px-3 py-2 rounded-lg shadow">
              <div className="flex space-x-1">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          </div>
        )}

        {/* 🎯 NEW CODE START — Show input box at center if new thread */}
        {/* New Thread Center Text Box */}
{isNewThread && (
  <div className="flex flex-col items-center justify-center h-full my-auto py-16">
      {/* 🆕 Tambahkan teks motivasi */}
    <div className="text-2xl text-blue-600 font-semibold mb-4 text-center">
      你好, let's start learning Mandarin!
    </div>
    <div className="relative w-full max-w-md">
      <textarea
        value={input}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="Type your message..."
        className="w-full border rounded-lg px-4 py-2 pr-20 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        style={{ 
          height: '40px', 
          maxHeight: '150px', 
          overflowY: 'auto' 
        }}
        disabled={isRecording || loading || tokenLimitReached || tokenStatusLoading}
      />
      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex space-x-2">
        <button
          onClick={handleVoiceInput}
          disabled={isRecording || audioPlaying || loading|| tokenLimitReached || tokenStatusLoading}
          className={`p-2 rounded-full flex items-center justify-center transition-all duration-200 ${
            isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
          }`}
        >
          {/* Mic icon */}
          {isRecording ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="8" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 06 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>
        <button
          onClick={sendMessage}
          disabled={!input.trim() || isRecording || loading}
          className={`p-2 rounded-full ${
            input.trim() && !isRecording && !loading
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  </div>
)}
        {/* 🔚 NEW CODE END */}

        <div ref={messageEndRef} />
      </div>
      {showScrollButton && (
        <div className="absolute bottom-20 left-0 right-0 flex justify-center z-20">
          <button
            onClick={scrollToBottom}
            className="bg-white text-gray-700 p-2.5 rounded-full shadow-lg hover:bg-blue-500 hover:text-white focus:outline-none transition-all duration-200 border border-gray-200"
            aria-label="Scroll to latest message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <polyline points="19 12 12 19 5 12"></polyline>
            </svg>
          </button>
        </div>
      )}
      <div className="border-t border-gray-200 p-2 bg-white">
  {/* Sembunyikan text box di bawah jika isNewThread aktif */}
  {!isNewThread && (
    <>
      {(recordingFeedback || detectedLang) && (
        <div className="flex items-center justify-between mb-1">
          {detectedLang && (
            <span className="text-xs text-gray-500">
              {detectedLang === 'zh-CN' ? '(Mandarin)' : '(English)'}
            </span>
          )}
          {recordingFeedback && (
            <div className={`text-xs ${isRecording ? 'text-red-500 animate-pulse' : 'text-green-500'}`}>
              {recordingFeedback}
            </div>
          )}
        </div>
      )}
      <div className="flex-1 relative flex items-center">
        <textarea
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Message"
          className="w-full border rounded-lg px-4 py-2 pr-16 text-base md:text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none overflow-hidden transition-all duration-200"
          style={{
            minHeight: '40px',
            maxHeight: '150px',
            overflowY: 'auto',
          }}
          disabled={isRecording || loading || tokenLimitReached || tokenStatusLoading}
        />
        <div className="absolute right-1 flex">
          <button
            onClick={handleVoiceInput}
            disabled={isRecording || audioPlaying || loading|| tokenLimitReached || tokenStatusLoading}
            className={`p-1.5 rounded-full flex items-center justify-center transition-all duration-200
                ${isRecording
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'text-gray-600 hover:bg-gray-100'
                }
                ${audioPlaying || loading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            aria-label="Record voice input"
          >
            {isRecording ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                  fill="currentColor" className="animate-pulse">
                  <circle cx="12" cy="12" r="8" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 06 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
          {loading ? (
            <button
              onClick={cancelRequest}
              disabled={isCancelling}
              className="p-1.5 rounded-full ml-1 bg-red-500 text-white hover:bg-red-600"
              aria-label="Cancel request"
            >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            </button>
) : (
  <button
    onClick={handleSendClick}
    disabled={!input.trim() || isRecording || loading || tokenLimitReached}
    className={`p-1.5 rounded-full ml-1 ${
      input.trim() && !isRecording && !loading
        ? 'bg-blue-500 text-white'
        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
    }`}
    aria-label="Send message"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  </button>
)}
        </div>
      </div>
    </>
  )}

  {/* Voice Confirmation Modal */}
{showVoiceConfirmModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
      <h3 className="text-lg font-semibold mb-4">Notice</h3>
      <p className="mb-4">
        Now voice chat function only available for English and Chinese Mandarin speakers. Do you want to continue?
      </p>
      <div className="flex items-center mb-4">
        <input
          type="checkbox"
          id="dont-show"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
          className="mr-2"
        />
        <label htmlFor="dont-show">Don't show me this message again in the future</label>
      </div>
      <div className="flex justify-end space-x-3">
        <button
          onClick={() => setShowVoiceConfirmModal(false)}
          className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
        >
          No
        </button>
        <button
          onClick={() => {
            if (dontShowAgain) {
             localStorage.setItem('voiceWarningAccepted', 'true');
            }
            setShowVoiceConfirmModal(false);
            startRecordingProcess(); // Mulai rekaman
          }}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Yes
        </button>
      </div>
    </div>
  </div>
)}
</div>
    </div>
  );
}