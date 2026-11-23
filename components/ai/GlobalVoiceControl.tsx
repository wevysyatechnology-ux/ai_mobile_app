import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { useAIConsent } from '@/contexts/AIConsentContext';
import { voiceOS } from '@/services/voiceOSService';
import { vapiService, VapiCallState } from '@/services/vapiService';
import { buildActionRoute } from '@/services/actionEngine';
import FloatingVoiceButton from './FloatingVoiceButton';

export default function GlobalVoiceControl() {
    const router = useRouter();
    const pathname = usePathname();
    const { isAuthenticated, isLoading } = useAuth();
    const { isConsentGranted, requestConsent } = useAIConsent();

    const [assistantMode, setAssistantMode] = useState<'custom' | 'vapi'>('vapi');
    const [orbState, setOrbState] = useState<'idle' | 'listening' | 'thinking' | 'responding'>('idle');
    const [toastMessage, setToastMessage] = useState('');
    const [showToast, setShowToast] = useState(false);
    const recordingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load saved assistant mode preference
    useEffect(() => {
        const loadMode = async () => {
            try {
                const savedMode = await AsyncStorage.getItem('@assistant_mode');
                if (savedMode === 'custom' || savedMode === 'vapi') {
                    setAssistantMode(savedMode);
                }
            } catch (e) {
                console.warn('⚠️ Failed to load assistant mode in GlobalVoiceControl:', e);
            }
        };
        loadMode();
    }, [pathname]);

    // Synchronize Vapi call state with local global orb state
    useEffect(() => {
        if (assistantMode !== 'vapi') return;

        const unsubscribe = vapiService.onStateChange((vapiState: VapiCallState) => {
            if (vapiState.status === 'listening') {
                setOrbState('listening');
                if (vapiState.transcript) {
                    setToastMessage(vapiState.transcript);
                    setShowToast(true);
                }
            } else if (vapiState.status === 'speaking') {
                setOrbState('responding');
                if (vapiState.response) {
                    setToastMessage(vapiState.response);
                    setShowToast(true);
                }
            } else if (vapiState.status === 'connecting') {
                setOrbState('thinking');
                setToastMessage('Connecting call...');
                setShowToast(true);
            } else if (vapiState.status === 'idle') {
                setOrbState('idle');
                setShowToast(false);
            } else if (vapiState.status === 'error') {
                setOrbState('idle');
                setToastMessage(vapiState.response || 'Vapi connection error');
                setShowToast(true);
            }
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [assistantMode]);

    // Stop recording/speaking/Vapi when user navigates away
    useEffect(() => {
        return () => {
            if (recordingTimeout.current) clearTimeout(recordingTimeout.current);
            voiceOS.stopSpeaking().catch(() => {});
            if (vapiService.isCallActive()) {
                vapiService.stopCall().catch(() => {});
            }
        };
    }, [pathname]);

    if (isLoading || !isAuthenticated || pathname === '/auth/login') {
        return null;
    }

    // Hide on voice-assistant page to avoid duplicate buttons
    if (pathname === '/voice-assistant') {
        return null;
    }

    const processRecording = async () => {
        try {
            if (recordingTimeout.current) {
                clearTimeout(recordingTimeout.current);
                recordingTimeout.current = null;
            }
            setOrbState('thinking');

            const transcript = await voiceOS.stopRecordingAndTranscribe();
            if (!transcript?.trim()) throw new Error('No speech detected');

            const result = await voiceOS.processCommand(transcript);

            setOrbState('responding');
            setToastMessage(result.response);
            setShowToast(true);

            await voiceOS.speak(result.response);

            if (result.shouldExecute && result.action?.screen) {
                setTimeout(() => router.push(buildActionRoute(result.action!) as any), 1500);
            }

            setOrbState('idle');
        } catch (error) {
            setOrbState('idle');
            const errMsg = error instanceof Error ? error.message : '';
            if (!errMsg.includes('No speech')) {
                setToastMessage('Voice processing failed. Please try again.');
                setShowToast(true);
            }
        }
    };

    const handleMicPress = async () => {
        if (!isConsentGranted) {
            requestConsent();
            return;
        }

        if (assistantMode === 'vapi') {
            try {
                if (vapiService.isCallActive()) {
                    console.log('🛑 Stopping Vapi Call...');
                    await vapiService.stopCall();
                } else {
                    console.log('📞 Starting Vapi Call...');
                    await vapiService.startCall();
                }
            } catch (error: any) {
                console.warn('⚠️ Global Vapi error:', error);
                setOrbState('idle');
                const isConfigError = error?.message?.includes('Vapi SDK not initialized');
                const isPermissionError = error?.message?.includes('permission');
                let friendlyResponse = error?.message || 'Failed to start voice connection.';
                if (isConfigError) {
                    friendlyResponse = 'Vapi SDK is not initialized. Run in preview build.';
                } else if (isPermissionError) {
                    friendlyResponse = 'Microphone permission required. Please allow access in settings.';
                }
                setToastMessage(friendlyResponse);
                setShowToast(true);
            }
            return;
        }

        try {
            if (orbState === 'responding') {
                await voiceOS.stopSpeaking();
                setOrbState('idle');
            } else if (orbState === 'listening') {
                await processRecording();
            } else {
                setOrbState('listening');
                await voiceOS.startRecording();
                // Auto-stop after 8 seconds
                recordingTimeout.current = setTimeout(() => processRecording(), 8000);
            }
        } catch (error) {
            console.error('❌ Mic error:', error);
            setOrbState('idle');
            const errMsg = error instanceof Error ? error.message : '';
            let userMsg = 'Voice processing failed. Please try again.';
            if (errMsg.includes('permission')) userMsg = 'Microphone permission required. Please allow access in settings.';
            else if (errMsg.includes('network')) userMsg = 'Network error. Check your connection.';
            setToastMessage(userMsg);
            setShowToast(true);
        }
    };

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <FloatingVoiceButton
                onPress={handleMicPress}
                isListening={orbState === 'listening'}
                isSpeaking={orbState === 'responding'}
            />
        </View>
    );
}
