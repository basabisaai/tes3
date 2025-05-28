// src/azureASR.js - Improved version with Mandarin language support
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

export async function startRecording(language = 'auto') {
  try {
    console.log("Speech recognition starting - environment check");
    console.log("User Agent:", navigator.userAgent);
    console.log("Platform:", navigator.platform);
    console.log("Language setting:", language);
    
    // 1. Verify browser environment with Chrome-specific checks
    if (typeof window === 'undefined') {
      console.error("Window object is undefined - not in browser context");
      throw new Error("This feature requires a browser environment");
    }
    
    if (!navigator || !navigator.mediaDevices) {
      console.error("MediaDevices API not available");
      
      // Specific error for Chrome users
      if (navigator.userAgent.indexOf("Chrome") > -1) {
        throw new Error("Please ensure Chrome has permission to use your microphone. Check chrome://settings/content/microphone");
      } else {
        throw new Error("Your browser doesn't support microphone access");
      }
    }
    
    // 2. Get credentials from environment
    console.log("Checking for Azure credentials...");
    const speechKey = import.meta.env.VITE_AZURE_SPEECH_KEY;
    const speechRegion = import.meta.env.VITE_AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      console.error("Azure speech credentials are missing");
      throw new Error("Azure credentials missing. Check environment variables.");
    }

    // 3. Check if SDK is available
    if (!sdk || !sdk.SpeechConfig) {
      console.error("Speech SDK not loaded properly");
      throw new Error("Speech recognition SDK failed to load");
    }
    
    // 4. Create audio configuration first - explicitly request permission
    console.log("Setting up microphone permissions...");
    let microphoneStream = null;
    
    try {
      // Request explicit permission with audio constraints optimized for speech
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("Microphone permission granted:", stream);
      
      // Save reference to stream for cleanup
      microphoneStream = stream;
      
      // Stop the stream immediately to free up the microphone for the SDK
      stream.getTracks().forEach(track => {
        track.stop();
        console.log("Track stopped:", track.id);
      });
      
      // Short delay to ensure microphone is released
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (micError) {
      console.error("Error accessing microphone:", micError);
      
      if (micError.name === 'NotAllowedError') {
        throw new Error("Microphone access denied. Check browser permissions.");
      } else if (micError.name === 'NotFoundError') {
        throw new Error("No microphone found. Please connect a microphone.");
      } else {
        throw new Error(`Microphone error: ${micError.message}`);
      }
    }
    
    // 5. Create speech configuration
    console.log("Creating speech config...");
    let speechConfig;
    try {
      speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
      console.log("Speech config created successfully");
    } catch (configError) {
      console.error("Failed to create speech config:", configError);
      throw new Error("Failed to initialize speech recognition: " + (configError.message || "configuration error"));
    }
    
    // 6. Set recognition language based on user choice or auto-detect
    try {
      if (language === 'auto') {
        // Auto mode - we'll use dual recognition approach
        console.log("Auto language detection mode enabled");
      } else if (language === 'zh-CN') {
        speechConfig.speechRecognitionLanguage = "zh-CN";
        console.log("Speech language set to Mandarin Chinese (zh-CN)");
      } else {
        speechConfig.speechRecognitionLanguage = "en-US";
        console.log("Speech language set to English (en-US)");
      }
    } catch (langError) {
      console.warn("Error setting language:", langError);
      // Continue with default
    }
    
    // 7. Create audioConfig after permissions are granted
    console.log("Creating audio config...");
    let audioConfig;
    try {
      audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
      console.log("Audio config created successfully");
    } catch (audioConfigError) {
      console.error("Error creating audio config:", audioConfigError);
      throw new Error("Failed to initialize microphone: " + (audioConfigError.message || "audio configuration error"));
    }
    
    // 8. Create recognizer(s)
    console.log("Creating speech recognizer...");
    let recognizer;
    let mandarinRecognizer = null;

    try {
      if (language === 'auto') {
        // In auto mode, we'll create two recognizers and use the one with higher confidence
        const enConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
        enConfig.speechRecognitionLanguage = "en-US";
        
        const zhConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
        zhConfig.speechRecognitionLanguage = "zh-CN";
        
        recognizer = new sdk.SpeechRecognizer(enConfig, audioConfig);
        mandarinRecognizer = new sdk.SpeechRecognizer(zhConfig, audioConfig);
        
        console.log("Dual recognizers created for auto language detection");
      } else {
        // Single language mode
        recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
        console.log("Speech recognizer created successfully");
      }
    } catch (recognizerError) {
      console.error("Failed to create recognizer:", recognizerError);
      throw new Error("Failed to initialize speech recognizer: " + (recognizerError.message || "recognizer creation error"));
    }
    
    // 9. Start recognition with timeout handling
    console.log("Starting speech recognition session...");
    
    return new Promise((resolve, reject) => {
      try {
        // Set a timeout in case recognition hangs
        const timeout = setTimeout(() => {
          console.error("Recognition timed out");
          if (recognizer) {
            try { recognizer.close(); } catch (e) { console.error("Error closing recognizer:", e); }
          }
          if (mandarinRecognizer) {
            try { mandarinRecognizer.close(); } catch (e) { console.error("Error closing Mandarin recognizer:", e); }
          }
          reject(new Error("Recognition timed out. Please try again."));
        }, 15000); // Extended timeout for dual recognition
        
        // Helper function to clean up resources
        const cleanupResources = () => {
          if (recognizer) {
            try { recognizer.close(); } catch (e) { console.error("Error closing recognizer:", e); }
          }
          if (mandarinRecognizer) {
            try { mandarinRecognizer.close(); } catch (e) { console.error("Error closing Mandarin recognizer:", e); }
          }
        };

        // Set up event handlers
        recognizer.recognizing = (s, e) => {
          console.log(`RECOGNIZING: ${e.result.text}`);
        };
        
        // Dual recognizer approach for auto language detection
        if (language === 'auto') {
          let englishResult = null;
          let mandarinResult = null;
          
          // Process results from both recognizers and determine the best one
          const processDualResults = () => {
            if (englishResult && mandarinResult) {
              clearTimeout(timeout);
              cleanupResources();
              
              console.log("English recognition confidence:", englishResult.confidence);
              console.log("Mandarin recognition confidence:", mandarinResult.confidence);
              
              // Check if text looks like it contains Mandarin characters
              const containsHanzi = /[\u4e00-\u9fa5]/.test(mandarinResult.text);
              const mandarinConfident = mandarinResult.confidence > 0.6 || containsHanzi;
              
              // Simple heuristic - prefer Mandarin if it has Hanzi or good confidence
              if (mandarinConfident) {
                console.log("Auto-detected language: Mandarin Chinese");
                resolve({
                  text: mandarinResult.text,
                  language: 'zh-CN'
                });
              } else {
                console.log("Auto-detected language: English");
                resolve({
                  text: englishResult.text, 
                  language: 'en-US'
                });
              }
            }
          };
          
          // Start English recognition
          recognizer.recognizeOnceAsync(
            result => {
              console.log("English recognition result:", result);
              
              if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                englishResult = {
                  text: result.text,
                  confidence: result.confidence !== undefined ? result.confidence : 0.7
                };
                processDualResults();
              } else if (mandarinResult) {
                // If English fails but Mandarin succeeded, use Mandarin
                clearTimeout(timeout);
                cleanupResources();
                resolve({
                  text: mandarinResult.text,
                  language: 'zh-CN'
                });
              }
            },
            error => {
              console.error("English recognition error:", error);
              // Don't reject here, wait for the Mandarin recognizer
            }
          );
          
          // Start Mandarin recognition in parallel
          mandarinRecognizer.recognizeOnceAsync(
            result => {
              console.log("Mandarin recognition result:", result);
              
              if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                mandarinResult = {
                  text: result.text,
                  confidence: result.confidence !== undefined ? result.confidence : 0.7
                };
                processDualResults();
              } else if (englishResult) {
                // If Mandarin fails but English succeeded, use English
                clearTimeout(timeout);
                cleanupResources();
                resolve({
                  text: englishResult.text,
                  language: 'en-US'
                });
              }
            },
            error => {
              console.error("Mandarin recognition error:", error);
              // Don't reject here, wait for the English recognizer
            }
          );
        } else {
          // Single language recognition
          recognizer.recognizeOnceAsync(
            result => {
              clearTimeout(timeout);
              console.log("Recognition result:", result);
              cleanupResources();
              
              if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                console.log("Recognized text:", result.text);
                resolve({
                  text: result.text,
                  language: language === 'zh-CN' ? 'zh-CN' : 'en-US'
                });
              } else if (result.reason === sdk.ResultReason.NoMatch) {
                console.error("NOMATCH: No speech could be recognized.");
                reject(new Error("No speech detected. Please try speaking more clearly."));
              } else if (result.reason === sdk.ResultReason.Canceled) {
                const cancellation = sdk.CancellationDetails.fromResult(result);
                console.error("CANCELED: Reason=", cancellation.reason);
                
                if (cancellation.reason === sdk.CancellationReason.Error) {
                  console.error("CANCELED: ErrorCode=", cancellation.errorCode);
                  console.error("CANCELED: ErrorDetails=", cancellation.errorDetails);
                  reject(new Error(`Recognition canceled: ${cancellation.errorDetails || "Unknown error"}`));
                } else {
                  reject(new Error("Recognition canceled"));
                }
              } else {
                reject(new Error("Speech recognition failed with reason: " + result.reason));
              }
            },
            error => {
              clearTimeout(timeout);
              console.error("Recognition error:", error);
              cleanupResources();
              reject(new Error("Recognition error: " + (error.message || "Unknown error")));
            }
          );
        }
      } catch (setupError) {
        console.error("Error during recognizer setup:", setupError);
        
        // Ensure we clean up resources
        if (recognizer) {
          try { recognizer.close(); } catch (e) { console.error("Error closing recognizer:", e); }
        }
        if (mandarinRecognizer) {
          try { mandarinRecognizer.close(); } catch (e) { console.error("Error closing Mandarin recognizer:", e); }
        }
        
        reject(new Error("Failed to start speech recognition: " + setupError.message));
      }
    });
  } catch (error) {
    console.error("Speech recognition setup failed:", error);
    throw error;
  }
}