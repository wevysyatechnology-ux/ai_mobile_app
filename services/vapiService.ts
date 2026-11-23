import { Platform } from 'react-native';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { voiceOS } from './voiceOSService';

export interface VapiCallState {
  status: 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';
  transcript: string;
  response: string;
}

class VapiService {
  private vapiInstance: any = null;
  private publicKey: string = process.env.EXPO_PUBLIC_VAPI_PUBLIC_KEY || '';
  private assistantId: string = process.env.EXPO_PUBLIC_VAPI_ASSISTANT_ID || '';
  private listeners: Set<(state: VapiCallState) => void> = new Set();
  private isConnected = false;
  private isConnecting = false;
  private _vapiAvailable = false;
  private callStartedAt: number | null = null;

  private currentState: VapiCallState = {
    status: 'idle',
    transcript: '',
    response: '',
  };

  constructor() {
    // Defer initialization to prevent startup crashes when native modules are not compiled yet
    if (!this.assistantId) {
      console.warn('⚠️ EXPO_PUBLIC_VAPI_ASSISTANT_ID is not set — falling back to the hardcoded default assistant ID.');
    }
  }

  private initializeVapi() {
    try {
      if (!this.publicKey) {
        console.warn('⚠️ Vapi Public Key is not set in environment variables.');
        return;
      }

      if (Platform.OS === 'web') {
        // Dynamic require for Web SDK to prevent bundling native deps on Web
        const VapiWebModule = require('@vapi-ai/web');
        const VapiWeb = VapiWebModule.default || VapiWebModule;
        this.vapiInstance = new VapiWeb(this.publicKey);
        console.log('🎙️ Vapi Web SDK Initialized');
      } else {
        // Dynamic require for React Native SDK to prevent loading it on Web
        const VapiRNModule = require('@vapi-ai/react-native');
        const VapiRN = VapiRNModule.default || VapiRNModule;
        this.vapiInstance = new VapiRN(this.publicKey);
        console.log('🎙️ Vapi React Native SDK Initialized');
      }

      this.setupEventListeners();
      this._vapiAvailable = true;
    } catch (error) {
      console.warn('⚠️ Vapi failed to initialize (WebRTC native modules missing or not configured):', error);
      this.vapiInstance = null;
      this._vapiAvailable = false;
    }
  }

  isAvailable(): boolean {
    return this._vapiAvailable;
  }

  private setupEventListeners() {
    if (!this.vapiInstance) return;

    this.vapiInstance.on('call-start', () => {
      console.log('📞 Vapi Call Started');
      this.isConnected = true;
      this.isConnecting = false;
      this.callStartedAt = Date.now();
      this.updateState({ status: 'listening', transcript: 'Call connected. Speak now...' });
    });

    this.vapiInstance.on('call-end', () => {
      console.log('📞 Vapi Call Ended');
      this.isConnected = false;
      this.isConnecting = false;
      this.updateState({ status: 'idle' });
    });

    this.vapiInstance.on('speech-start', () => {
      console.log('🗣️ AI speech started');
      this.updateState({ status: 'speaking' });
    });

    this.vapiInstance.on('speech-end', () => {
      console.log('🗣️ AI speech ended');
      this.updateState({ status: 'listening' });
    });

    this.vapiInstance.on('message', (message: any) => {
      // Handle transcription and transcripts messages
      if (message.type === 'transcript') {
        const transcriptText = message.transcript;
        if (message.role === 'user') {
          this.updateState({ transcript: transcriptText });
        } else if (message.role === 'assistant') {
          this.updateState({ response: transcriptText });
        }
      }
    });

    this.vapiInstance.on('error', (error: any) => {
      console.warn('⚠️ Vapi Error:', error);
      this.isConnecting = false;
      this.isConnected = false;
      
      let errorMsg = 'An error occurred during call.';
      let isNormalTeardown = false;

      if (typeof error === 'string') {
        errorMsg = error;
        if (error.includes('Meeting has ended') || error.includes('room was deleted') || error.includes('no-room')) {
          isNormalTeardown = true;
        }
      } else if (error && typeof error === 'object') {
        errorMsg = error.errorMsg || error.message || error.msg || (error.error && error.error.msg) || JSON.stringify(error);
        const errorType = error.type || (error.error && error.error.type) || '';
        if (
          errorType === 'no-room' ||
          errorMsg.includes('Meeting has ended') ||
          errorMsg.includes('room was deleted') ||
          errorMsg.includes('Meeting ended in error')
        ) {
          isNormalTeardown = true;
        }
      }

      if (isNormalTeardown) {
        const callDurationMs = this.callStartedAt ? Date.now() - this.callStartedAt : null;
        if (callDurationMs !== null && callDurationMs < 10000) {
          // A call ending this fast almost certainly isn't a real hangup — most likely
          // an upstream tool-call webhook failed/timed out and Vapi tore down the room.
          // Log loudly even though the UI stays calm, so this doesn't hide silently again.
          console.error(
            `🚨 Vapi call ended abnormally fast (${callDurationMs}ms) — likely a failed tool-call webhook, not a real hangup. Raw error:`,
            error
          );
        }
        console.log('ℹ️ Vapi call ended naturally (room closed/deleted). Transitioning status to idle.');
        this.updateState({ status: 'idle' });
      } else {
        this.updateState({ status: 'error', response: errorMsg });
      }
    });
  }

  onStateChange(callback: (state: VapiCallState) => void) {
    this.listeners.add(callback);
    if (!this.vapiInstance) {
      this.initializeVapi();
    }
    // Immediately send current state
    callback(this.currentState);

    return () => {
      this.listeners.delete(callback);
    };
  }

  private updateState(newState: Partial<VapiCallState>) {
    this.currentState = { ...this.currentState, ...newState };
    this.listeners.forEach((callback) => {
      try {
        callback(this.currentState);
      } catch (e) {
        console.error('Error calling Vapi listener:', e);
      }
    });
  }

  async startCall(assistantIdOrConfig?: any): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      console.warn('⚠️ Vapi call already active or connecting. Ignoring start request.');
      return;
    }

    if (!this.vapiInstance) {
      this.initializeVapi();
    }

    if (!this.vapiInstance) {
      throw new Error('Vapi SDK not initialized.');
    }

    this.isConnecting = true;

    try {
      // Request audio recording permissions if not on web
      if (Platform.OS !== 'web') {
        console.log('🎙️ Requesting microphone permission...');
        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) {
          throw new Error('Microphone permission not granted');
        }
        console.log('✅ Microphone permission granted');

        // Configure audio mode for duplex WebRTC recording/playback to prevent expo-av conflicts
        console.log('🎙️ Configuring Audio session for Vapi call...');
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          shouldDuckAndroid: true,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        });
        console.log('✅ Audio session configured for duplex voice streaming');
      }

      this.updateState({ status: 'connecting', transcript: 'Connecting call...', response: '' });
      
      // Fetch Supabase session info and enforce auth guard
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !session?.user?.id) {
        throw new Error('Please log in to use the voice assistant.');
      }

      const accessToken = session.access_token;
      const userId = session.user.id;
      const preferredLanguage = voiceOS.getLanguage() || 'en';

      const assistantOverrides = {
        variableValues: {
          accessToken,
          userId,
          preferredLanguage,
          serverParameters: {
            accessToken,
            userId,
            preferredLanguage
          }
        },
        metadata: {
          accessToken,
          userId,
          preferredLanguage,
          serverParameters: {
            accessToken,
            userId,
            preferredLanguage
          }
        }
      };

      console.log('🔑 Attaching auth parameters to Vapi call:', { hasToken: !!accessToken, userId, preferredLanguage });

      // Determine the active assistant ID (fallback to production assistant containing Supabase tools)
      const activeAssistantId = (typeof assistantIdOrConfig === 'string' && assistantIdOrConfig)
        || this.assistantId
        || "3f1e8a79-f0a6-4d46-b3cd-19ef749dc0f8";

      // Start the call using the SDK-compliant assistantOverrides structure
      if (assistantIdOrConfig && typeof assistantIdOrConfig !== 'string') {
        await this.vapiInstance.start(assistantIdOrConfig, assistantOverrides);
      } else {
        await this.vapiInstance.start(activeAssistantId, assistantOverrides);
      }
    } catch (error) {
      console.warn('⚠️ Failed to start Vapi call:', error);
      this.isConnecting = false;
      this.updateState({ status: 'error', response: error instanceof Error ? error.message : 'Failed to start call.' });
      throw error;
    }
  }

  async stopCall(): Promise<void> {
    if (!this.vapiInstance) return;

    try {
      await this.vapiInstance.stop();
      this.isConnected = false;
      this.updateState({ status: 'idle' });
    } catch (error) {
      console.warn('⚠️ Failed to stop Vapi call:', error);
    }
  }

  isCallActive(): boolean {
    return this.isConnected;
  }
}

export const vapiService = new VapiService();
