// azureTTS.js - Improved client-side TTS handling with better error handling and state management

let globalAudioContext = null;
let currentSource = null;
let isPlaybackActive = false;
let activePlaybackPromise = null;

// Create or get existing audio context with proper initialization
function getAudioContext() {
  if (!globalAudioContext || globalAudioContext.state === 'closed') {
    try {
      globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log(`Created new AudioContext, state: ${globalAudioContext.state}`);
    } catch (err) {
      console.error("Failed to create AudioContext:", err);
      throw new Error("Browser audio playback not supported");
    }
  }
  
  // Always attempt to resume suspended context
  if (globalAudioContext.state === 'suspended') {
    console.log("Attempting to resume suspended AudioContext");
    globalAudioContext.resume().catch(err => {
      console.warn("Failed to resume AudioContext:", err);
    });
  }
  
  return globalAudioContext;
}

// Enhanced text processing for TTS
function preprocessTextForTTS(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  let processedText = text.trim();
  
  // Break very long sentences to improve TTS reliability
  const maxSentenceLength = 300;
  const sentences = processedText.match(/[^.!?]+[.!?]+/g) || [processedText];
  
  processedText = sentences.map(sentence => {
    if (sentence.length > maxSentenceLength) {
      // Find good breaking points for long sentences
      return sentence
        .replace(/(\s*,\s*|\s*;\s*|\s*-\s*|\s*–\s*|\s*—\s*)(?=[a-zA-Z])/g, '. ')
        .replace(/(\w+):(\s*\d+\.\s+)/g, '$1. $2')
        .replace(/(\d+)\.(\s*\w+)\s*\(([^\)]+)\):/g, '$1. $2 ($3)')
        .replace(/:/g, '.');
    }
    return sentence;
  }).join(' ');
  
  // Handle special characters and formatting that may cause TTS issues
  processedText = processedText
    .replace(/(\w+):(\s*\d+\.\s+)/g, '$1. $2')
    .replace(/(\d+)\.(\s*\w+)\s*\(([^\)]+)\):/g, '$1. $2 ($3)')
    .replace(/:/g, '.')
    .replace(/\s{2,}/g, ' ');
    
  return processedText;
}

// Main speak function with better error handling and state management
export async function speakText(text, language = 'en-US') {
  // Don't start new TTS if one is already in progress
  if (isPlaybackActive && activePlaybackPromise) {
    console.log("TTS already active, stopping previous playback");
    await stopAllAudio();
  }
  
  if (!text || text.trim() === '') {
    console.warn('TTS: Empty text provided');
    return Promise.resolve();
  }
  
  // Process text for better TTS results
  const processedText = preprocessTextForTTS(text);
  console.log(`Processing text for TTS (${language}): ${processedText.substring(0, 50)}...`);
  
  const BACKEND_TTS_URL = import.meta.env.VITE_BACKEND_TTS_URL || 'http://localhost:3000/api/tts/speak';
  const textChunks = splitTextIntoChunks(processedText);
  const audioQueue = [];
  let currentChunkIndex = 0;
  isPlaybackActive = true;
  let prefetchPosition = 0;
  const MAX_PREFETCH = 2;
  
  // Create a new promise that we can track
  activePlaybackPromise = new Promise(async (resolve, reject) => {
    let audioContext;
    
    try {
      audioContext = getAudioContext();
      console.log(`Using AudioContext in state: ${audioContext.state}`);
    } catch (err) {
      console.error("Failed to get AudioContext:", err);
      isPlaybackActive = false;
      reject(err);
      return;
    }

    // Make sure we have user interaction to enable audio
    if (audioContext.state === 'suspended') {
      try {
        console.log("Attempting to resume AudioContext...");
        await audioContext.resume();
        console.log("AudioContext resumed successfully");
      } catch (err) {
        console.warn("Could not resume AudioContext:", err);
        // Continue anyway, as the context might resume when playback starts
      }
    }

    async function prefetchNextChunks() {
      let successfulFetches = 0;
      
      while (
        prefetchPosition < textChunks.length &&
        prefetchPosition < currentChunkIndex + MAX_PREFETCH &&
        isPlaybackActive
      ) {
        const chunk = textChunks[prefetchPosition];
        if (!chunk || !chunk.trim()) {
          prefetchPosition++;
          continue;
        }
        
        try {
          console.log(`Prefetching chunk ${prefetchPosition}: ${chunk.substring(0, 30)}...`);
          const audioBuffer = await fetchAudioChunk(chunk, language);
          
          if (audioBuffer) {
            audioQueue.push({
              index: prefetchPosition,
              buffer: audioBuffer
            });
            console.log(`Added chunk ${prefetchPosition} to queue (queue length: ${audioQueue.length})`);
            successfulFetches++;
          }
        } catch (error) {
          console.error(`Failed to prefetch chunk ${prefetchPosition}:`, error);
          
          // Skip problematic chunks instead of failing the entire process
          if (textChunks.length > 1) {
            console.warn(`Skipping problematic chunk ${prefetchPosition}`);
          } else {
            // If this is the only chunk, we should fail
            if (successfulFetches === 0) {
              throw error;
            }
          }
        }
        
        prefetchPosition++;
      }
      
      return successfulFetches > 0;
    }

    async function fetchAudioChunk(chunk, language) {
      if (!isPlaybackActive) {
        console.log("Playback canceled, aborting fetch");
        return null;
      }
      
      // Try to ensure AudioContext is in the right state
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
          console.log("AudioContext resumed before fetch");
        } catch (err) {
          console.warn("Could not resume AudioContext:", err);
          // Continue anyway
        }
      }
      
      try {
        // Set up timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
          console.warn("TTS fetch timeout after 8 seconds");
        }, 8000);
        
        console.log(`Sending chunk to TTS backend: ${chunk.substring(0, 50)}...`);
        
        const response = await fetch(BACKEND_TTS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunk, language }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown server error" }));
          console.error(`TTS request failed with status ${response.status}:`, errorData);
          
          // Handle specific error cases
          if (response.status === 400 || response.status === 413) {
            console.warn("Content issue detected, trying to simplify chunk");
            // Try simplifying the content (remove special characters, etc.)
            const simplifiedChunk = chunk
              .replace(/[^\w\s.,?!-]/g, ' ')
              .replace(/\s{2,}/g, ' ')
              .trim();
              
            if (simplifiedChunk !== chunk) {
              return await fetchAudioChunk(simplifiedChunk, language);
            }
          }
          
          throw new Error(`TTS request failed: ${errorData.error || `Status ${response.status}`}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          console.warn("Empty audio data received");
          return null;
        }
        
        return await audioContext.decodeAudioData(arrayBuffer);
      } catch (error) {
        // Enhanced error handling
        if (error.name === "AbortError") {
          console.error("Fetch operation timed out");
        } else if (error.message && error.message.includes("decodeAudioData")) {
          console.error("Failed to decode audio data:", error);
        } else {
          console.error("TTS fetch error:", error);
        }
        
        throw error;
      }
    }

    function playNextInQueue() {
      if (!isPlaybackActive) {
        console.log("Playback no longer active, stopping queue processing");
        return;
      }
      
      // Check for valid AudioContext
      if (!audioContext || audioContext.state === 'closed') {
        console.warn("AudioContext is closed or invalid. Cannot play chunk.");
        isPlaybackActive = false;
        audioQueue.length = 0;
        resolve();
        return;
      }

      if (audioQueue.length === 0) {
        if (currentChunkIndex < textChunks.length) {
          // Wait briefly and check again
          setTimeout(() => {
            if (isPlaybackActive && currentChunkIndex < textChunks.length) {
              playNextInQueue();
            } else if (currentChunkIndex >= textChunks.length) {
              console.log("All chunks processed, playback complete");
              isPlaybackActive = false;
              resolve();
            }
          }, 100);
        } else {
          console.log("Playback complete - no more chunks");
          isPlaybackActive = false;
          resolve();
        }
        return;
      }

      const nextItemIndex = audioQueue.findIndex(item => item.index === currentChunkIndex);
      
      if (nextItemIndex === -1) {
        if (currentChunkIndex < textChunks.length) {
          setTimeout(() => {
            if (isPlaybackActive) playNextInQueue();
          }, 100);
          return;
        } else {
          console.log("Playback complete - no matching chunks");
          isPlaybackActive = false;
          resolve();
          return;
        }
      }

      const item = audioQueue.splice(nextItemIndex, 1)[0];

      try {
        if (audioContext.state === 'suspended') {
          audioContext.resume()
            .then(() => {
              if (isPlaybackActive) continuePlayback(item);
            })
            .catch(error => {
              console.error('Failed to resume AudioContext:', error);
              currentChunkIndex++;
              setTimeout(() => {
                if (isPlaybackActive) playNextInQueue();
              }, 100);
            });
        } else {
          continuePlayback(item);
        }
      } catch (error) {
        console.error(`Error playing chunk ${item.index}:`, error);
        currentChunkIndex++;
        setTimeout(() => {
          if (isPlaybackActive) playNextInQueue();
        }, 100);
      }
    }

    function continuePlayback(item) {
      // Cleanup any existing source
      if (currentSource) {
        try {
          currentSource.stop();
          currentSource.disconnect();
        } catch (e) {
          console.warn("Error cleaning up previous source:", e);
        }
        currentSource = null;
      }

      const source = audioContext.createBufferSource();
      source.buffer = item.buffer;
      
      // Create a gain node to control volume
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1.0; // Full volume
      
      // Connect the source to the gain node and then to the destination
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Set up event handler for when playback ends
      source.onended = () => {
        // Disconnect this source and gain node
        try {
          source.disconnect();
          gainNode.disconnect();
        } catch (err) {
          console.warn("Error disconnecting audio nodes:", err);
        }
        
        if (!isPlaybackActive) {
          console.log("Playback stopped externally, not continuing to next chunk");
          return;
        }
        
        currentChunkIndex++;
        prefetchNextChunks().catch(err => console.error("Prefetch error:", err));
        
        if (currentChunkIndex < textChunks.length) {
          setTimeout(() => {
            if (isPlaybackActive) playNextInQueue();
          }, 10);
        } else {
          console.log("Playback of all chunks complete");
          isPlaybackActive = false;
          resolve();
        }
      };

      // Store reference to current source for potential stopping
      currentSource = source;
      
      // Start playback
      try {
        source.start(0);
        console.log(`Playing chunk ${item.index} (chunks remaining: ${textChunks.length - currentChunkIndex - 1})`);
      } catch (err) {
        console.error("Error starting audio playback:", err);
        // Try to recover by moving to next chunk
        currentChunkIndex++;
        setTimeout(() => {
          if (isPlaybackActive) playNextInQueue();
        }, 10);
      }
    }

    // Start the playback process
    try {
      console.log(`Starting TTS playback with ${textChunks.length} chunks`);
      
      if (textChunks.length === 0) {
        console.log("No text chunks to play");
        isPlaybackActive = false;
        resolve();
        return;
      }

      // Set up timeout to prevent hanging
      const promiseTimeout = setTimeout(() => {
        console.warn('TTS: Operation timed out after 30 seconds');
        isPlaybackActive = false;
        resolve();
      }, 30000000); // 30 seconds timeout

      const success = await prefetchNextChunks();
      
      if (!success) {
        console.error("No audio chunks could be fetched. Aborting playback.");
        isPlaybackActive = false;
        clearTimeout(promiseTimeout);
        reject(new Error("Failed to fetch any audio data"));
        return;
      }

      playNextInQueue();

      // Set up a regular check to see if playback has completed
      const checkInterval = setInterval(() => {
        if (!isPlaybackActive) {
          clearInterval(checkInterval);
          clearTimeout(promiseTimeout);
          resolve();
        }
      }, 200);
    } catch (err) {
      console.error('TTS prefetch error:', err);
      isPlaybackActive = false;
      reject(err);
    }
  });

  return activePlaybackPromise;
}

// Improved stopAllAudio function
export function stopAllAudio() {
  console.log("Stopping all audio playback");
  isPlaybackActive = false;
  
  return new Promise((resolve) => {
    try {
      if (currentSource) {
        try {
          currentSource.onended = null; // Remove event handler
          currentSource.stop();
          currentSource.disconnect();
          console.log("Stopped current audio source");
        } catch (err) {
          console.warn("Error stopping current source:", err);
        }
        currentSource = null;
      }

      // Don't close the AudioContext completely, just suspend it
      if (globalAudioContext && globalAudioContext.state !== 'closed') {
        globalAudioContext.suspend()
          .then(() => {
            console.log("AudioContext suspended");
            resolve();
          })
          .catch(err => {
            console.warn("Error suspending AudioContext:", err);
            resolve();
          });
      } else {
        resolve();
      }
    } catch (err) {
      console.error("Error in stopAllAudio:", err);
      resolve();
    }
  });
}

// Improved text chunking function
function splitTextIntoChunks(text) {
  console.log("Original text length before splitting:", text.length);

  const OPTIMAL_CHUNK_LENGTH = 100; // Shorter chunks for better reliability
  const MAX_CHUNK_LENGTH = 180;     // Maximum chunk size
  const SPLIT_POINTS = [
    { pattern: /[.!?。？！]\s+/g, priority: 1 }, // Sentence endings
    { pattern: /[:;]\s+/g, priority: 2 },       // Colons and semicolons
    { pattern: /[,，、]\s*/g, priority: 3 },     // Commas
    { pattern: /\s+-\s+/g, priority: 3.5 },     // Hyphens with spaces
    { pattern: /\s+/g, priority: 4 }            // Any whitespace
  ];

  // Handle special formatting and newlines for better chunking
  const processedText = text
    .replace(/\n+/g, '. ') // Replace newlines with periods for better sentence splitting
    .replace(/([.!?])\s*\n/g, '$1 ') // Handle sentence endings with newlines
    .replace(/\s{2,}/g, ' ') // Normalize whitespace
    .trim();
  
  if (processedText.length <= OPTIMAL_CHUNK_LENGTH) {
    console.log("Text is short enough for a single chunk");
    return [processedText];
  }

  let chunks = [];
  let remainingText = processedText;
  
  // Main chunking loop
  while (remainingText.length > 0) {
    if (remainingText.length <= MAX_CHUNK_LENGTH) {
      chunks.push(remainingText);
      break;
    }
    
    let splitIndex = -1;
    
    // Find the best split point
    for (const { pattern, priority } of SPLIT_POINTS) {
      let bestSplitIndex = -1;
      const matches = Array.from(remainingText.matchAll(new RegExp(pattern, 'g')));
      
      for (const match of matches) {
        const matchIndex = match.index + match[0].length;
        
        // Prioritize split points near the optimal length
        if (matchIndex >= OPTIMAL_CHUNK_LENGTH * 0.7 && matchIndex <= OPTIMAL_CHUNK_LENGTH) {
          bestSplitIndex = matchIndex;
          break;
        }
        
        // Otherwise take the last valid split point before max length
        if (matchIndex > bestSplitIndex && matchIndex < MAX_CHUNK_LENGTH) {
          bestSplitIndex = matchIndex;
        }
      }
      
      if (bestSplitIndex > 0) {
        splitIndex = bestSplitIndex;
        break;
      }
    }
    
    // If no good split point found, just split at the optimal length
    if (splitIndex === -1 || splitIndex > MAX_CHUNK_LENGTH) {
      splitIndex = Math.min(OPTIMAL_CHUNK_LENGTH, remainingText.length);
      console.warn("No ideal split point found, forcing split at", splitIndex);
    }
    
    const chunk = remainingText.substring(0, splitIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    
    remainingText = remainingText.substring(splitIndex).trim();
  }

  // Filter out empty chunks and log results
  const filteredChunks = chunks.filter(chunk => chunk.trim().length > 0);
  console.log(`Split text into ${filteredChunks.length} chunks`);
  
  return filteredChunks;
}