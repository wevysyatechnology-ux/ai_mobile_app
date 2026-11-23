import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Mic, MicOff, Volume2, Copy, RotateCw, Square } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { voiceOS, SUPPORTED_LANGUAGES } from '@/services/voiceOSService';
import { actionEngine, buildActionRoute } from '@/services/actionEngine';
import { knowledgeService } from '@/services/knowledgeService';
import { loadKnowledgeBase } from '@/utils/knowledgeLoader';
import { seedBusinessAdvisorKnowledge } from '@/utils/seedBusinessAdvisorKnowledge';
import { vapiService, VapiCallState } from '@/services/vapiService';

interface VoiceState {
  status: 'idle' | 'listening' | 'processing' | 'speaking' | 'error' | 'connecting';
  transcript: string;
  response: string;
  intent: string;
  confidence: number;
}

/**
 * 🎤 WeVysya Voice Assistant Screen
 * 
 * Complete voice interaction UI showcasing all 5 pillars:
 * 1️⃣ Wake Word Detection
 * 2️⃣ Speech → Text (Whisper)
 * 3️⃣ Knowledge Brain (RAG)
 * 4️⃣ Action Engine
 * 5️⃣ Text → Speech
 */
export default function VoiceAssistantScreen() {
  const router = useRouter();
  const [assistantMode, setAssistantMode] = useState<'custom' | 'vapi'>('vapi');
  const [state, setState] = useState<VoiceState>({
    status: 'idle',
    transcript: '',
    response: '',
    intent: '',
    confidence: 0,
  });

  const [initialized, setInitialized] = useState(false);
  const [selectedLang, setSelectedLang] = useState(voiceOS.getLanguage());
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const animationLoopRef = useRef<any>(null);
  const isMountedRef = useRef(true);

  const handleLanguageChange = (code: string) => {
    voiceOS.setLanguage(code);
    setSelectedLang(code);
  };

  // Load saved assistant mode preference
  useEffect(() => {
    AsyncStorage.getItem('@assistant_mode')
      .then(savedMode => {
        if (savedMode === 'custom' || savedMode === 'vapi') {
          setAssistantMode(savedMode);
        }
      })
      .catch(err => console.warn('⚠️ Failed to load assistant mode:', err));
  }, []);

  // Initialize voice OS and knowledge base
  useEffect(() => {
    isMountedRef.current = true;

    const initialize = async () => {
      try {
        console.log('🚀 Initializing WeVysya Voice OS...');

        // Initialize voice OS immediately so the mic is ready without waiting for KB
        voiceOS.activateWakeWord();

        if (isMountedRef.current) {
          setInitialized(true);
        }

        // Load knowledge base in the background — skip silently if already loaded
        loadKnowledgeBase()
          .then(() => console.log('✅ Knowledge base loaded'))
          .catch(e => console.warn('⚠️ Knowledge base load failed (non-critical):', e));

        seedBusinessAdvisorKnowledge()
          .catch(e => console.warn('⚠️ Business advisor knowledge load failed (non-critical):', e));
      } catch (error) {
        console.error('❌ Failed to initialize Voice OS:', error);
        if (isMountedRef.current) {
          setState(prev => ({
            ...prev,
            status: 'error',
            response: 'Failed to initialize Voice OS. Please check your API keys.',
          }));
        }
      }
    };

    initialize();

    // Cleanup function
    return () => {
      isMountedRef.current = false;
      voiceOS.deactivateWakeWord();
      if (vapiService.isCallActive()) {
        vapiService.stopCall().catch(e => console.error(e));
      }
      if (animationLoopRef.current) {
        animationLoopRef.current.stop();
        animationLoopRef.current = null;
      }
    };
  }, []);

  // Synchronize Vapi call state with local screen state
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    if (assistantMode === 'vapi') {
      unsubscribe = vapiService.onStateChange((vapiState: VapiCallState) => {
        if (isMountedRef.current) {
          setState(prev => ({
            ...prev,
            status: vapiState.status,
            transcript: vapiState.transcript || prev.transcript,
            response: vapiState.response || prev.response,
            intent: vapiState.status === 'idle' ? '' : 'Vapi Call',
            confidence: 1.0,
          }));
        }
      });
    } else {
      if (vapiService.isCallActive()) {
        vapiService.stopCall().catch(e => console.error(e));
      }
      setState(prev => ({
        ...prev,
        status: 'idle',
        transcript: '',
        response: '',
        intent: '',
        confidence: 0,
      }));
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [assistantMode]);

  // Pulse animation when listening
  useEffect(() => {
    if (state.status === 'listening') {
      // Stop any existing animation
      if (animationLoopRef.current) {
        animationLoopRef.current.stop();
      }

      // Create and start new animation
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      animationLoopRef.current = loop;
      loop.start();
    } else {
      // Stop animation and reset value
      if (animationLoopRef.current) {
        animationLoopRef.current.stop();
        animationLoopRef.current = null;
      }
      pulseAnim.setValue(1);
    }

    // Cleanup on unmount or status change
    return () => {
      if (animationLoopRef.current) {
        animationLoopRef.current.stop();
        animationLoopRef.current = null;
      }
    };
  }, [state.status, pulseAnim]);

  /**
   * Handle mic press
   * Tap to activate listening
   */
  const handleMicPress = async () => {
    try {
      if (assistantMode === 'vapi') {
        if (vapiService.isCallActive()) {
          console.log('🛑 Stopping Vapi Call...');
          await vapiService.stopCall();
        } else {
          console.log('📞 Starting Vapi Call...');
          await vapiService.startCall();
        }
        return;
      }

      if (state.status === 'speaking') {
        console.log('🛑 Stopping AI voice...');
        await voiceOS.stopSpeaking();
        setState(prev => ({ ...prev, status: 'idle' }));
        return;
      }

      if (state.status === 'listening') {
        // Stop recording and process
        await handleStopListening();
        return;
      }

      setState(prev => ({
        ...prev,
        status: 'listening',
        transcript: '',
        response: '',
      }));

      // Start recording
      await voiceOS.startRecording();
      console.log('🎤 Recording started');
    } catch (error: any) {
      console.warn('⚠️ Voice Assistant error:', error);
      const isConfigError = error?.message?.includes('Vapi SDK not initialized');
      const isPermissionError = error?.message?.includes('permission');
      let friendlyResponse = error?.message || 'Failed to start voice connection.';
      if (isConfigError) {
        friendlyResponse = 'Vapi SDK is not initialized. Please ensure the app is running in a preview/development build with WebRTC configured.';
      } else if (isPermissionError) {
        friendlyResponse = 'Microphone permission required. Please allow access in settings.';
      }
      setState(prev => ({
        ...prev,
        status: 'error',
        response: friendlyResponse,
      }));
    }
  };

  /**
   * Stop listening and process command
   */
  const handleStopListening = async () => {
    try {
      setState(prev => ({ ...prev, status: 'processing' }));

      // Transcribe audio
      const transcript = await voiceOS.stopRecordingAndTranscribe();
      setState(prev => ({ ...prev, transcript }));

      // Process command using the optimized pipeline
      const result = await voiceOS.processCommand(transcript);

      // Update state
      setState(prev => ({
        ...prev,
        status: 'speaking',
        response: result.response,
        intent: result.intent,
        confidence: 1,
      }));

      // Speak response
      await voiceOS.speak(result.response);

      // Execute action if needed
      if (result.shouldExecute && result.action?.screen) {
        router.push(buildActionRoute(result.action) as any);
      }

      setState(prev => ({ ...prev, status: 'idle' }));
    } catch (error) {
      console.error('❌ Processing error:', error);
      setState(prev => ({
        ...prev,
        status: 'error',
        response: 'Processing failed. Please try again.',
      }));
    }
  };

  /**
   * Copy transcript to clipboard
   */
  const handleCopyTranscript = async () => {
    if (state.transcript) {
      try {
        await Clipboard.setStringAsync(state.transcript);
        Alert.alert('Copied', 'Transcript copied to clipboard');
      } catch (error) {
        console.error('Failed to copy:', error);
        Alert.alert('Error', 'Failed to copy transcript');
      }
    }
  };

  /**
   * Test mode - process text directly
   */
  const handleTestMode = async (text: string) => {
    try {
      setState(prev => ({ ...prev, status: 'processing' }));

      // Process command using the optimized pipeline
      const result = await voiceOS.processCommand(text);

      setState(prev => ({
        ...prev,
        status: 'speaking',
        response: result.response,
        transcript: text,
        intent: result.intent,
        confidence: 1,
      }));

      await voiceOS.speak(result.response);

      if (result.shouldExecute && result.action?.screen) {
        router.push(buildActionRoute(result.action) as any);
      }

      setState(prev => ({ ...prev, status: 'idle' }));
    } catch (error) {
      console.error('❌ Test error:', error);
      setState(prev => ({
        ...prev,
        status: 'error',
        response: 'Test failed. Please try again.',
      }));
    }
  };

  const isListening = state.status === 'listening';
  const isProcessing = state.status === 'processing' || state.status === 'connecting';
  const isSpeaking = state.status === 'speaking';

  return (
    <ScrollView className="flex-1 bg-gray-900">
      {/* Header */}
      <View className="p-6 pt-12">
        <Text className="text-3xl font-bold text-white mb-2">🎤 WeVysya Voice OS</Text>
        <Text className="text-gray-400">
          Wake word activated • Full knowledge assistant • Action capable
        </Text>
      </View>

      {/* Assistant Mode Toggle */}
      <View className="px-6 pb-4">
        <Text className="text-gray-400 text-xs mb-2">🤖 Assistant Engine:</Text>
        <View className="flex-row bg-gray-800 rounded-xl p-1">
          <Pressable
            onPress={() => {
              if (state.status !== 'idle' && state.status !== 'error') {
                Alert.alert('Busy', 'Please stop the active session before switching engines.');
                return;
              }
              setAssistantMode('custom');
              AsyncStorage.setItem('@assistant_mode', 'custom').catch(e => console.warn(e));
            }}
            className={`flex-1 py-3 rounded-lg items-center ${
              assistantMode === 'custom' ? 'bg-blue-600' : 'bg-transparent'
            }`}
          >
            <Text className="text-white font-semibold text-sm">Custom Voice OS</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (state.status !== 'idle' && state.status !== 'error') {
                Alert.alert('Busy', 'Please stop the active session before switching engines.');
                return;
              }
              setAssistantMode('vapi');
              AsyncStorage.setItem('@assistant_mode', 'vapi').catch(e => console.warn(e));
            }}
            className={`flex-1 py-3 rounded-lg items-center ${
              assistantMode === 'vapi' ? 'bg-teal-500' : 'bg-transparent'
            }`}
          >
            <Text className="text-white font-semibold text-sm">Vapi Real-Time Voice</Text>
          </Pressable>
        </View>
      </View>

      {/* Language Selector */}
      {assistantMode === 'custom' && (
        <View className="px-6 pb-4">
          <Text className="text-gray-400 text-xs mb-2">🌐 Voice Language:</Text>
          <View className="flex-row flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <Pressable
                key={lang.code}
                onPress={() => handleLanguageChange(lang.code)}
                className={`px-3 py-2 rounded-full ${
                  selectedLang === lang.code
                    ? 'bg-teal-500'
                    : 'bg-gray-700'
                }`}
              >
                <Text className={`text-sm font-medium ${
                  selectedLang === lang.code ? 'text-white' : 'text-gray-300'
                }`}>
                  {lang.nativeLabel}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Main Mic Button */}
      <View className="flex-1 items-center justify-center py-8">
        {isSpeaking ? (
          <Animated.View
            style={{
              transform: [{ scale: pulseAnim }],
            }}
            className="w-32 h-32 rounded-full bg-red-500 items-center justify-center mb-4"
          >
            <Square size={64} fill="white" color="white" />
          </Animated.View>
        ) : isListening ? (
          <Animated.View
            style={{
              transform: [{ scale: pulseAnim }],
            }}
            className="w-32 h-32 rounded-full bg-red-500 items-center justify-center mb-4"
          >
            <MicOff size={64} color="white" />
          </Animated.View>
        ) : (
          <View className="w-32 h-32 rounded-full bg-blue-600 items-center justify-center mb-4">
            <Mic size={64} color="white" />
          </View>
        )}

        <Pressable
          onPress={handleMicPress}
          disabled={!initialized}
          className={`px-8 py-4 rounded-full mb-4 ${isListening || isSpeaking || state.status === 'connecting' ? 'bg-red-500' : 'bg-blue-600'
            } ${!initialized ? 'opacity-50' : ''}`}
        >
          <Text className="text-white font-bold text-lg">
            {assistantMode === 'vapi'
              ? (vapiService.isCallActive() ? '🛑 Stop Vapi Call' : '📞 Start Vapi Call')
              : (isSpeaking ? '🛑 Stop AI Voice' : isListening ? '🛑 Stop Recording' : '🎤 Start Listening')}
          </Text>
        </Pressable>

        <Text className="text-gray-400 text-center mb-8">
          {state.status === 'idle' && (assistantMode === 'vapi' ? 'Tap to start real-time conversation' : 'Tap to start listening')}
          {state.status === 'connecting' && 'Connecting to Vapi...'}
          {state.status === 'listening' && 'Listening... Speak now'}
          {state.status === 'processing' && 'Processing...'}
          {state.status === 'speaking' && 'Speaking response...'}
          {state.status === 'error' && 'Error occurred'}
        </Text>
      </View>

      {/* Status Display */}
      <View className="px-6 py-4">
        {/* Transcript */}
        {state.transcript && (
          <View className="bg-gray-800 rounded-lg p-4 mb-4">
            <View className="flex-row justify-between items-start mb-2">
              <Text className="text-gray-400 text-sm">📝 You said:</Text>
              <Pressable onPress={handleCopyTranscript} className="p-2">
                <Copy size={16} color="#9CA3AF" />
              </Pressable>
            </View>
            <Text className="text-white text-base">{state.transcript}</Text>
          </View>
        )}

        {/* Intent Classification */}
        {state.intent && (
          <View className="bg-gray-800 rounded-lg p-4 mb-4">
            <Text className="text-gray-400 text-sm mb-2">🎯 Intent Classification:</Text>
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-white font-bold">
                {state.intent === 'knowledge' ? '📚' : '⚡'} {state.intent}
              </Text>
              <Text className="text-blue-400 text-sm">
                {Math.round(state.confidence * 100)}% confidence
              </Text>
            </View>
          </View>
        )}

        {/* Response */}
        {state.response && (
          <View className="bg-gradient-to-b from-green-900 to-gray-800 rounded-lg p-4">
            <View className="flex-row items-center mb-2">
              <Volume2 size={16} color="#4ade80" />
              <Text className="text-gray-400 text-sm ml-2">🤖 Assistant:</Text>
            </View>
            <Text className="text-white text-base leading-6">{state.response}</Text>
          </View>
        )}
      </View>

      {/* Test Mode - Quick Commands */}
      {assistantMode === 'custom' && (
        <View className="px-6 py-6">
          <Text className="text-gray-400 text-sm mb-3">💡 Quick Test Commands:</Text>
          <View className="gap-2">
            <Pressable
              onPress={() => handleTestMode('Find a CA in Bengaluru')}
              className="bg-purple-700 px-4 py-3 rounded-lg"
            >
              <Text className="text-white font-medium">Find CA in Bengaluru</Text>
            </Pressable>

            <Pressable
              onPress={() => handleTestMode('What is WeVysya?')}
              className="bg-blue-700 px-4 py-3 rounded-lg"
            >
              <Text className="text-white font-medium">What is WeVysya?</Text>
            </Pressable>

            <Pressable
              onPress={() => handleTestMode('Post a deal')}
              className="bg-green-700 px-4 py-3 rounded-lg"
            >
              <Text className="text-white font-medium">Post a deal</Text>
            </Pressable>

            <Pressable
              onPress={() => handleTestMode('Create i2we connection')}
              className="bg-orange-700 px-4 py-3 rounded-lg"
            >
              <Text className="text-white font-medium">Create i2we</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setState({
                  status: 'idle',
                  transcript: '',
                  response: '',
                  intent: '',
                  confidence: 0,
                });
              }}
              className="bg-gray-700 px-4 py-3 rounded-lg flex-row items-center justify-center"
            >
              <RotateCw size={16} color="#fff" />
              <Text className="text-white font-medium ml-2">Clear</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Architecture Info */}
      {assistantMode === 'custom' && (
        <View className="px-6 pb-8">
          <Text className="text-gray-400 text-xs mb-3">🏗️ Architecture:</Text>
          <View className="bg-gray-800 rounded-lg p-4 gap-3">
            <View className="flex-row items-start">
              <Text className="text-blue-400 font-bold mr-2 mt-1">1️⃣</Text>
              <View className="flex-1">
                <Text className="text-gray-300 font-bold">Wake Word Detection</Text>
                <Text className="text-gray-500 text-xs">Tap mic to activate listening</Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <Text className="text-blue-400 font-bold mr-2 mt-1">2️⃣</Text>
              <View className="flex-1">
                <Text className="text-gray-300 font-bold">Speech → Text (Whisper)</Text>
                <Text className="text-gray-500 text-xs">Records and transcribes voice</Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <Text className="text-blue-400 font-bold mr-2 mt-1">3️⃣</Text>
              <View className="flex-1">
                <Text className="text-gray-300 font-bold">Knowledge Brain (RAG)</Text>
                <Text className="text-gray-500 text-xs">Searches relevant context with embeddings</Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <Text className="text-blue-400 font-bold mr-2 mt-1">4️⃣</Text>
              <View className="flex-1">
                <Text className="text-gray-300 font-bold">Action Engine</Text>
                <Text className="text-gray-500 text-xs">Classifies intent and parameters</Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <Text className="text-blue-400 font-bold mr-2 mt-1">5️⃣</Text>
              <View className="flex-1">
                <Text className="text-gray-300 font-bold">Text → Speech</Text>
                <Text className="text-gray-500 text-xs">Speaks back the response</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
