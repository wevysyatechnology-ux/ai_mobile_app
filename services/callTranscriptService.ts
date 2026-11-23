import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { getTranscribeEndpoint } from '@/lib/apiConfig';

/**
 * Per-device call transcription: while a call is active, each phone records
 * its OWN microphone independently of the WebRTC call (a separate
 * expo-av Audio.Recording instance, not the call's own audio stream), then
 * transcribes it via the existing OpenAI-Whisper-backed `transcribe` edge
 * function and saves it as this speaker's segment. Two speakers' segments,
 * merged by created_at, form the full conversation transcript — see
 * app/call-transcript.tsx.
 *
 * Deliberately independent of services/voiceOSService.ts's own recording
 * singleton (used by the AI voice assistant) so the two features never
 * fight over the same recording state. Ownership of the Audio.Recording
 * instance stays with the caller (app/call.tsx), tied to that screen's own
 * lifecycle — same pattern as its RTCPeerConnection ref.
 *
 * Best-effort by design: every failure here should be swallowed by the
 * caller (`.catch(() => {})`) — a transcription problem must never disrupt
 * the call itself.
 */
export const CallTranscriptService = {
  async startRecording(): Promise<Audio.Recording | null> {
    if (Platform.OS === 'web') return null; // not supported on web this round

    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) throw new Error('Microphone permission not granted');

    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    return recording;
  },

  async stopAndSaveTranscript(
    recording: Audio.Recording,
    callId: string,
    speakerId: string
  ): Promise<void> {
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    if (!uri) throw new Error('No recording URI available');

    const text = await this.transcribeAudio(uri);
    if (!text.trim()) return; // nothing said / silence-only segment, skip

    const { error } = await supabase.from('call_transcripts').insert({
      call_id: callId,
      speaker_id: speakerId,
      text: text.trim(),
    });
    if (error) throw error;
  },

  /** Same multipart-upload shape as voiceOSService.ts's transcribeAudio(). */
  async transcribeAudio(audioUri: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', { uri: audioUri, type: 'audio/m4a', name: 'audio.m4a' } as any);
    formData.append('language', 'en');

    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
    const response = await fetch(getTranscribeEndpoint(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${supabaseAnonKey}` },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Transcription failed: ${response.status}`);
    }

    const data = await response.json();
    return data.text || '';
  },
};
