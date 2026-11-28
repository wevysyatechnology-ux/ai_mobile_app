import { Audio } from 'expo-av';
import { Platform } from 'react-native';
// Lazy load expo-speech to prevent crashing if the native module is not built/present
let Speech: any = null;
try {
  Speech = require('expo-speech');
} catch (error) {
  console.warn('⚠️ expo-speech native module not found. Device speech fallback will not be available.', error);
}
import { knowledgeService } from './knowledgeService';
import { actionEngine } from './actionEngine';
import { getTranscribeEndpoint, getSpeakEndpoint, getAnalyzeTextEndpoint, fetchWithErrorHandling } from '@/lib/apiConfig';

export interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
  ttsLocale: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en',  label: 'English',   nativeLabel: 'English',    ttsLocale: 'en-IN' },
  { code: 'te',  label: 'Telugu',    nativeLabel: 'తెలుగు',      ttsLocale: 'te-IN' },
];

export interface VoiceCommand {
  transcript: string;
  intent: string;
  action?: any;
  response: string;
  shouldExecute: boolean;
}

/**
 * 🧠🎤 WeVysya Voice OS
 * Complete voice-activated AI assistant system
 */
interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

class VoiceOSService {
  private recording: Audio.Recording | null = null;
  private sound: Audio.Sound | null = null;
  private isListening = false;
  private wakeWordActive = false;
  private selectedLanguage: string = 'en';
  private conversationHistory: ConversationTurn[] = [];
  private sessionMemoryLoaded = false;
  // Web-only: browser MediaRecorder
  private mediaRecorder: any = null;
  private audioChunks: Blob[] = [];

  setLanguage(langCode: string): void {
    const valid = SUPPORTED_LANGUAGES.find(l => l.code === langCode);
    if (valid) {
      this.selectedLanguage = langCode;
      console.log(`🌐 Language set to: ${valid.label}`);
    }
  }

  getLanguage(): string {
    return this.selectedLanguage;
  }

  getLanguageOption(): LanguageOption {
    return SUPPORTED_LANGUAGES.find(l => l.code === this.selectedLanguage) || SUPPORTED_LANGUAGES[0];
  }

  /**
   * 1️⃣ Wake Word Detection (Tap to Activate)
   * User taps mic → Listening mode activated
   */
  async activateWakeWord(): Promise<void> {
    this.wakeWordActive = true;
    console.log('🎤 Wake word mode activated: Listening for "Hey WeVysya"');
  }

  deactivateWakeWord(): void {
    this.wakeWordActive = false;
    console.log('🎤 Wake word mode deactivated');
  }

  /**
   * 2️⃣ Speech → Text (OpenAI Whisper)
   * Web: uses MediaRecorder API. Native: uses expo-av.
   */
  async startRecording(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        // Use browser MediaRecorder — expo-av recording doesn't work on web
        const stream = await (navigator as any).mediaDevices.getUserMedia({ audio: true });
        this.audioChunks = [];
        this.mediaRecorder = new (window as any).MediaRecorder(stream);
        this.mediaRecorder.ondataavailable = (e: any) => {
          if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
        };
        this.mediaRecorder.start();
        this.isListening = true;
        console.log('🎤 Web recording started (MediaRecorder)...');
        return;
      }

      // Native: expo-av
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Audio recording permission not granted');
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      this.recording = recording;
      this.isListening = true;
      console.log('🎤 Recording started...');
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      throw error;
    }
  }

  async stopRecordingAndTranscribe(): Promise<string> {
    try {
      if (Platform.OS === 'web') {
        if (!this.mediaRecorder) throw new Error('No active web recording');

        console.log('🛑 Stopping web recording...');
        const blob = await new Promise<Blob>((resolve) => {
          this.mediaRecorder.onstop = () => {
            resolve(new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' }));
          };
          this.mediaRecorder.stop();
          // Release mic
          this.mediaRecorder.stream?.getTracks().forEach((t: any) => t.stop());
        });

        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isListening = false;

        const transcript = await this.transcribeBlob(blob);
        console.log('📝 Transcript:', transcript);
        return transcript;
      }

      // Native: expo-av
      if (!this.recording) throw new Error('No active recording');

      console.log('🛑 Stopping recording...');
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      this.isListening = false;
      this.recording = null;

      if (!uri) throw new Error('No recording URI available');

      const transcript = await this.transcribeAudio(uri);
      console.log('📝 Transcript:', transcript);
      return transcript;
    } catch (error) {
      console.error('❌ Failed to transcribe:', error);
      throw error;
    }
  }

  /** Transcribe a Blob (web path) — sends directly to Whisper edge function */
  private async transcribeBlob(blob: Blob): Promise<string> {
    const formData = new FormData();
    // Use .webm extension — that's what MediaRecorder produces in browsers
    formData.append('file', blob, 'audio.webm');
    formData.append('language', this.selectedLanguage);

    const endpoint = getTranscribeEndpoint();
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${supabaseAnonKey}` },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Transcription failed: ${response.status}`);
    }

    const data = await response.json();
    return data.text || '';
  }

  /**
   * Transcribe audio using backend proxy endpoint
   * The actual OpenAI Whisper API call is made server-side for security
   */
  private async transcribeAudio(audioUri: string): Promise<string> {
    try {
      console.log('🎙️ Preparing audio file for transcription...');

      // Create FormData for multipart upload
      const formData = new FormData();

      // For React Native, we need to use the URI-based format
      // The fetch API on React Native handles this specially
      const fileData: any = {
        uri: audioUri,
        type: 'audio/m4a',
        name: 'audio.m4a',
      };

      // On web, we need to convert to blob
      if (Platform.OS === 'web') {
        const response = await fetch(audioUri);
        const blob = await response.blob();
        formData.append('file', blob, 'audio.m4a');
      } else {
        // On mobile, use URI format
        formData.append('file', fileData as any);
      }

      formData.append('language', this.selectedLanguage);

      // Call backend proxy endpoint via Supabase Edge Function
      const endpoint = getTranscribeEndpoint();

      // Get Supabase anon key for authorization
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

      console.log('📡 Calling Deepgram transcribe endpoint...');
      const transcribeResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: formData,
      });

      if (!transcribeResponse.ok) {
        let errorMessage = 'Unknown error';

        // Try to parse JSON error first
        try {
          const errorData = await transcribeResponse.json();
          console.error('❌ Transcribe error response:', errorData);
          errorMessage = errorData.error?.message || errorData.error || errorData.message || 'Unknown error';
        } catch {
          // Fall back to text response
          try {
            const textError = await transcribeResponse.text();
            console.error('❌ Transcribe text error:', textError);
            errorMessage = textError || `HTTP ${transcribeResponse.status}`;
          } catch {
            errorMessage = `HTTP ${transcribeResponse.status}: Failed to transcribe`;
          }
        }

        throw new Error(`Deepgram transcription failed: ${errorMessage}`);
      }

      const data = await transcribeResponse.json();
      console.log('✅ Transcription successful:', data.text);
      return data.text;
    } catch (error) {
      console.error('❌ Deepgram transcription failed:', error);
      throw error;
    }
  }

  /**
   * 3️⃣ + 4️⃣ Knowledge Brain + Action Engine
   * Process the voice command through RAG and intent classification
   */
  async processCommand(transcript: string): Promise<VoiceCommand> {
    try {
      console.log('🧠 Processing command:', transcript);

      // Guard: empty transcript
      if (!transcript || transcript.trim().length < 2) {
        return {
          transcript,
          intent: 'error',
          response: "I didn't catch that. Could you speak a bit more clearly?",
          shouldExecute: false,
        };
      }

      // Check if it's ONLY a wake word (short phrase, no actual query)
      if (this.isWakeWord(transcript)) {
        const greeting = this.selectedLanguage === 'hi'
          ? 'हाँ, बोलिए! मैं सुन रहा हूँ।'
          : 'Yes, I\'m listening. How can I help you?';
        return { transcript, intent: 'wake_word', response: greeting, shouldExecute: false };
      }

      await this.loadSessionMemory();

      // Try fast local classification first (zero latency)
      let intent = actionEngine.fastLocalClassification(transcript);

      // If local regex didn't catch it, call backend GPT
      if (!intent) {
        // Fetch RAG context in parallel with initial classification
        // (knowledge queries need context; action queries don't — GPT decides)
        const [classifiedIntent, ragContext] = await Promise.all([
          actionEngine.classifyIntent(transcript, this.buildConversationContext()),
          knowledgeService.searchKnowledge(transcript).catch(() => ''),
        ]);

        if (classifiedIntent.type === 'knowledge' && ragContext) {
          // Re-call backend with the RAG context so GPT generates a full, grounded answer
          intent = await actionEngine.classifyIntent(transcript, ragContext);
        } else {
          intent = classifiedIntent;
        }
      }

      console.log('🎯 Final Intent:', intent.type, intent.category);

      let response: string;

      if (intent.type === 'knowledge') {
        // The classify-intent backend already wrote the full answer in intent.response
        response = intent.response || "I'm not sure about that. Try asking in a different way.";
      } else {
        response = intent.response || "Sure, let me help you with that.";

        // Execute DB queries immediately and get the spoken result before TTS
        if (intent.action?.name.startsWith('query_')) {
          try {
            console.log('⚡ Executing DB query before TTS...');
            const result = await actionEngine.executeAction(intent, this.selectedLanguage);
            if (result?.spokenResponse) {
              response = result.spokenResponse;
            }
            // Persist the freshest activity data into the knowledge base so the AI
            // can answer follow-up questions without hitting the DB again.
            if (result?.success && result?.stats) {
              this.syncActivityStatsToKnowledgeBase(
                intent.action.name,
                result.stats,
                response,
              ).catch(e => console.warn('⚠️ KB sync failed (non-critical):', e));
            }
            intent.action.name = 'resolved_query';
          } catch (e) {
            console.error('DB query execution failed:', e);
          }
        }

        // Language switch: apply immediately
        if (intent.action?.name === 'switch_language') {
          const newLang = intent.action.parameters?.languageCode as string;
          if (newLang) this.setLanguage(newLang);
          intent.action.name = 'resolved_language_switch';
        }
      }

      // Save to conversation history (last 6 turns kept)
      this.conversationHistory.push({ role: 'user', content: transcript });
      this.conversationHistory.push({ role: 'assistant', content: response });
      if (this.conversationHistory.length > 12) {
        this.conversationHistory = this.conversationHistory.slice(-12);
      }
      this.persistSessionMemory().catch(e => console.warn('⚠️ Session memory persist failed (non-critical):', e));

      return {
        transcript,
        intent: intent.type,
        action: intent.action,
        response,
        shouldExecute:
          intent.type === 'action' &&
          intent.action?.name !== 'resolved_query' &&
          intent.action?.name !== 'resolved_language_switch',
      };
    } catch (error) {
      console.error('❌ Command processing failed:', error);
      const errMsg = error instanceof Error ? error.message : 'unknown';
      // Human-friendly error based on failure type
      let friendlyResponse = "Sorry, something went wrong. Please try again.";
      if (errMsg.includes('network') || errMsg.includes('fetch')) {
        friendlyResponse = "I'm having trouble connecting. Please check your internet and try again.";
      } else if (errMsg.includes('transcri')) {
        friendlyResponse = "I couldn't understand the audio. Please speak clearly and try again.";
      }
      return { transcript, intent: 'error', response: friendlyResponse, shouldExecute: false };
    }
  }

  /** Build a short conversation context string for the backend */
  private buildConversationContext(): string {
    if (this.conversationHistory.length === 0) return '';
    return this.conversationHistory
      .slice(-6)
      .map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
      .join('\n');
  }

  /** Clear conversation history */
  clearHistory(): void {
    this.conversationHistory = [];
    this.sessionMemoryLoaded = false;
  }

  /**
   * 🧠 Cross-session memory: at the start of a fresh session (no in-memory history yet),
   * recall the last remembered exchange from a previous session so follow-up questions
   * still make sense after an app restart. Runs once per session.
   */
  private async loadSessionMemory(): Promise<void> {
    if (this.sessionMemoryLoaded || this.conversationHistory.length > 0) return;
    this.sessionMemoryLoaded = true;
    try {
      const memory = await knowledgeService.getPersonalDocument('Recent Conversation', 'session_memory');
      if (memory) {
        this.conversationHistory.push({
          role: 'assistant',
          content: `(From our last conversation)\n${memory}`,
        });
      }
    } catch (e) {
      console.warn('⚠️ Failed to load session memory (non-critical):', e);
    }
  }

  /**
   * Persist the rolling conversation window so it survives app restarts / new
   * sessions, not just the in-memory buffer that's cleared on clearHistory().
   */
  private async persistSessionMemory(): Promise<void> {
    if (this.conversationHistory.length === 0) return;
    await knowledgeService.upsertDocument({
      content: this.buildConversationContext(),
      metadata: { title: 'Recent Conversation', category: 'session_memory', source: 'session_memory' },
    });
  }

  /**
   * 🗄️ Sync latest activity stats into the knowledge base.
   * Called automatically after every successful DB query so the AI self-improves
   * and can answer follow-up questions from context without re-querying the DB.
   */
  private async syncActivityStatsToKnowledgeBase(
    actionName: string,
    stats: any,
    spokenSummary: string,
  ): Promise<void> {
    let title = '';
    let category = '';
    let content = '';

    if (actionName === 'query_links_stats' && stats) {
      title = 'User Links Activity';
      category = 'user_activity';
      content =
        `User Links Summary (auto-updated):\n` +
        `Total links: ${stats.total}\n` +
        `Sent by user: ${stats.sent}\n` +
        `Received by user: ${stats.received}\n` +
        `Open: ${stats.open}\n` +
        `Closed: ${stats.closed}\n` +
        `Summary: ${spokenSummary}`;
    } else if (actionName === 'query_deals_stats' && stats) {
      title = 'User Deals Activity';
      category = 'user_activity';
      content =
        `User Deals Summary (auto-updated):\n` +
        `Total deals: ${stats.total}\n` +
        `Open: ${stats.open}\n` +
        `In Progress: ${stats.in_progress}\n` +
        `Completed: ${stats.completed}\n` +
        `Closed: ${stats.closed}\n` +
        `Created by user: ${stats.as_creator}\n` +
        `Participating in: ${stats.as_participant}\n` +
        `Summary: ${spokenSummary}`;
    } else if (actionName === 'query_i2we_stats' && stats) {
      title = 'User i2We Activity';
      category = 'user_activity';
      content =
        `User i2We Meetings Summary (auto-updated):\n` +
        `Total meetings: ${stats.total}\n` +
        `Scheduled: ${stats.scheduled}\n` +
        `Completed: ${stats.completed}\n` +
        `Cancelled: ${stats.cancelled}\n` +
        `Summary: ${spokenSummary}`;
    } else if (actionName === 'query_all_activity_stats' && stats) {
      title = 'User Full Activity Summary';
      category = 'user_activity';
      const { links, deals, i2We } = stats;
      content =
        `User Full Activity Summary (auto-updated):\n` +
        `Links — total: ${links?.total}, open: ${links?.open}, closed: ${links?.closed}\n` +
        `Deals — total: ${deals?.total}, open: ${deals?.open}, completed: ${deals?.completed}\n` +
        `i2We — total: ${i2We?.total}, scheduled: ${i2We?.scheduled}, completed: ${i2We?.completed}\n` +
        `Summary: ${spokenSummary}`;
    }

    if (!title || !content) return;

    await knowledgeService.upsertDocument({
      content,
      metadata: { title, category, source: 'user_activity' },
    });
    console.log('✅ Knowledge base synced with latest activity:', title);
  }

  /**
   * 5️⃣ Text → Speech
   * South Indian languages (te/ta/kn/ml): expo-speech (device native voice — instant, correct accent)
   * English / Hindi: OpenAI TTS tts-1 (natural, fast)
   */
  async speak(text: string): Promise<void> {
    await this.stopSpeaking();
    const langOption = this.getLanguageOption();
    const southIndian = ['ta', 'te', 'kn', 'ml'];

    // South Indian → device native TTS (proper accent, zero latency)
    if (southIndian.includes(this.selectedLanguage)) {
      console.log(`🔊 Speaking with expo-speech [${langOption.ttsLocale}]:`, text.substring(0, 60));
      return new Promise<void>((resolve) => {
        if (!Speech) {
          console.warn('⚠️ Speech module not available');
          resolve();
          return;
        }
        Speech.speak(text, {
          language: langOption.ttsLocale,
          rate: 0.9,
          pitch: 1.0,
          onDone: () => resolve(),
          onStopped: () => resolve(),
          onError: () => resolve(),
        });
      });
    }

    console.log(`🔊 Speaking with OpenAI TTS [${langOption.code}]:`, text.substring(0, 60));

    try {
      const endpoint = getSpeakEndpoint();
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

      // Add 3.5s timeout to prevent UI freezes during network slow-downs or cold-starts
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.warn('⏱️ OpenAI TTS request timed out. Aborting and falling back...');
      }, 3500);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ text, voice: 'nova', model: 'tts-1' }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status}`);
      }

      if (Platform.OS === 'web') {
        // Web: use Blob URL + HTML5 Audio element
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        await new Promise<void>((resolve, reject) => {
          const audio = new (window as any).Audio(audioUrl);
          audio.onended = () => { URL.revokeObjectURL(audioUrl); resolve(); };
          audio.onerror = (e: any) => { URL.revokeObjectURL(audioUrl); reject(e); };
          audio.play().catch(reject);
        });
      } else {
        // Native: write MP3 to cache, play with expo-av
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const FileSystem = require('expo-file-system/legacy');
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        // Encode to base64 safely (no spread-operator stack overflow on large files)
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        const fileUri = `${FileSystem.cacheDirectory}tts_${Date.now()}.mp3`;
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: 'base64',
        });

        const { sound } = await Audio.Sound.createAsync({ uri: fileUri });
        this.sound = sound;

        await new Promise<void>((resolve) => {
          let done = false;
          sound.setOnPlaybackStatusUpdate((status: any) => {
            if (!done && (status.didJustFinish || status.error)) {
              done = true;
              resolve();
            }
          });
          sound.playAsync().catch(() => { if (!done) { done = true; resolve(); } });
        });

        await sound.unloadAsync();
        this.sound = null;
        FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
      }
    } catch (error) {
      console.error('❌ OpenAI TTS failed, falling back to expo-speech:', error);
      const langOption = this.getLanguageOption();
      return new Promise<void>((resolve) => {
        if (!Speech) {
          console.warn('⚠️ Speech module not available for fallback');
          resolve();
          return;
        }
        Speech.speak(text, {
          language: langOption.ttsLocale,
          rate: 0.92,
          pitch: 1.0,
          onDone: () => resolve(),
          onStopped: () => resolve(),
          onError: () => resolve(),
        });
      });
    }
  }

  async stopSpeaking(): Promise<void> {
    try { if (Speech) Speech.stop(); } catch { /* ignore */ }
    if (this.sound) {
      try {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
      } catch { /* ignore */ }
      this.sound = null;
    }
  }

  /**
   * 🎯 Complete Voice Flow
   * Full end-to-end voice interaction
   */
  async executeVoiceFlow(): Promise<VoiceCommand> {
    try {
      // Step 1: Record audio
      await this.startRecording();
      console.log('🎤 Listening... (Speak now)');

      // Wait for user to speak (in real implementation, use voice activity detection)
      // For now, caller controls when to stop

      return {
        transcript: '',
        intent: 'recording',
        response: 'Recording...',
        shouldExecute: false,
      };
    } catch (error) {
      console.error('❌ Voice flow failed:', error);
      throw error;
    }
  }

  /**
   * Check if transcript is ONLY a wake phrase (not a real query containing the word 'wevysya').
   * e.g. "Hey WeVysya" → true  |  "What is WeVysya?" → false
   */
  private isWakeWord(transcript: string): boolean {
    const lowerTranscript = transcript.toLowerCase().trim();
    // Only match short greetings, not sentences that happen to contain the brand name
    const wakePatterns = /^(hey|hi|hello|ok|okay)\s+wevysya[.!?]?$|^wevysya[.!?]?$/;
    return wakePatterns.test(lowerTranscript);
  }

  /**
   * Get listening status
   */
  isCurrentlyListening(): boolean {
    return this.isListening;
  }

  isWakeWordActive(): boolean {
    return this.wakeWordActive;
  }
}

export const voiceOS = new VoiceOSService();
