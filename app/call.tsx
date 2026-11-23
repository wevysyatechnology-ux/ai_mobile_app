import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { PhoneOff, Mic, MicOff, Volume2, User as UserIcon } from 'lucide-react-native';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { getWebRTCGlobals, setAudioOutput } from '@/utils/webrtcGlobals';
import { colors, spacing, fontSize } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { CallService } from '@/services/callService';
import { CallTranscriptService } from '@/services/callTranscriptService';
import { ConnectionsService, CounterpartProfile } from '@/services/connectionsService';
import { CallSession } from '@/types/database';

type CallPhase = 'connecting' | 'ringing' | 'active' | 'ended';

export default function Call() {
  const router = useRouter();
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ connectionId?: string; callId?: string; role?: string }>();
  const connectionId = params.connectionId || '';
  const callId = params.callId || '';
  const role = params.role === 'callee' ? 'callee' : 'caller';

  const [counterpart, setCounterpart] = useState<CounterpartProfile | null>(null);
  const [phase, setPhase] = useState<CallPhase>('connecting');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Platform.OS never changes at runtime, so resolving this once per mount is fine.
  const { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, getUserMedia } = useRef(
    getWebRTCGlobals()
  ).current;

  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const pendingRemoteCandidatesRef = useRef<any[]>([]);
  const hasRemoteDescriptionRef = useRef(false);
  const cleanupFnsRef = useRef<Array<() => void>>([]);
  const endedRef = useRef(false); // guards against double end-call / double navigation
  const callRecordingRef = useRef<Audio.Recording | null>(null);
  const transcriptionStartedRef = useRef(false); // guards against starting twice (both state listeners can fire 'connected')

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const cleanupAndLeave = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;

    cleanupFnsRef.current.forEach((fn) => fn());
    cleanupFnsRef.current = [];

    localStreamRef.current?.getTracks().forEach((track: any) => track.stop());
    localStreamRef.current = null;

    pcRef.current?.close();
    pcRef.current = null;

    // Fire-and-forget: uploading/transcribing takes a moment over the
    // network and must never delay navigating away from the call screen.
    if (callRecordingRef.current) {
      const recording = callRecordingRef.current;
      callRecordingRef.current = null;
      const speakerId = userIdRef.current;
      if (speakerId) {
        CallTranscriptService.stopAndSaveTranscript(recording, callId, speakerId).catch((err) =>
          console.warn('Failed to save call transcript:', err)
        );
      }
    }

    setPhase('ended');
    router.back();
  }, [router, callId]);

  const handleEndCall = useCallback(() => {
    CallService.endCall(callId).catch((err) => console.warn('Failed to end call:', err));
    cleanupAndLeave();
  }, [callId, cleanupAndLeave]);

  const handleRemoteCallEnded = useCallback(() => {
    // This fires both when the OTHER side already wrote a terminal status
    // (declined/missed/ended — arrived via Realtime) and when THIS side's
    // own RTCPeerConnection independently detects failure (connectionState/
    // iceConnectionState === 'failed'). In the second case nothing has been
    // written yet, so best-effort mark the call missed ourselves — otherwise
    // only the caller's 45s timeout would ever do this, leaving the other
    // party's screen stuck on "Connecting…" if e.g. the callee's own
    // connection fails first. markMissed()'s status guard (ringing/active
    // only) makes this a safe no-op when a terminal status already exists.
    CallService.markMissed(callId).catch(() => {});
    cleanupAndLeave();
  }, [callId, cleanupAndLeave]);

  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const queued = pendingRemoteCandidatesRef.current;
    pendingRemoteCandidatesRef.current = [];
    console.log(`[call] flushing ${queued.length} queued remote candidate(s)`);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log(`[call] queued candidate added OK: ${candidate?.candidate}`);
      } catch (err) {
        console.warn('Failed to add queued ICE candidate:', err);
      }
    }
  }, []);

  // Best-effort: starts a SEPARATE mic recording (own device only, nothing
  // to do with the WebRTC call's own audio) the moment the call is really
  // connected, for later transcription. Never lets a failure here affect
  // the call itself. Guarded so both connectionstatechange and
  // iceconnectionstatechange firing 'connected' only starts this once.
  const beginTranscription = useCallback(() => {
    if (transcriptionStartedRef.current) return;
    transcriptionStartedRef.current = true;
    CallTranscriptService.startRecording()
      .then((recording) => {
        callRecordingRef.current = recording;
        if (recording) setIsTranscribing(true);
      })
      .catch((err) => console.warn('Failed to start call transcription:', err));
  }, []);

  useEffect(() => {
    if (!connectionId || !callId) {
      setErrorMessage("This call isn't available.");
      return;
    }

    let cancelled = false;

    const setup = async () => {
      try {
        // Load counterpart profile for the header (mirrors chat-detail.tsx).
        const profiles = await ConnectionsService.getCounterpartProfiles([connectionId]);
        if (!cancelled) setCounterpart(profiles[connectionId] || null);

        // Mic permission + duplex audio session — identical pattern to
        // services/vapiService.ts's Vapi call setup.
        if (Platform.OS !== 'web') {
          const permission = await Audio.requestPermissionsAsync();
          if (!permission.granted) throw new Error('Microphone permission not granted');
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            interruptionModeIOS: InterruptionModeIOS.DoNotMix,
            shouldDuckAndroid: true,
            interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
          });
        }

        const iceServers = await CallService.getIceServers();
        const pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;

        const localStream = await getUserMedia({ audio: true, video: false });
        if (cancelled) {
          localStream.getTracks().forEach((t: any) => t.stop());
          return;
        }
        localStreamRef.current = localStream;
        localStream.getTracks().forEach((track: any) => pc.addTrack(track, localStream));

        // Cast to `any` for addEventListener: the runtime method comes from
        // event-target-shim (which @daily-co/react-native-webrtc's
        // RTCPeerConnection genuinely extends and calls at runtime), but its
        // shipped .d.ts doesn't cleanly surface it on this subclass — a
        // declaration-file gap, not a real API absence.
        console.log(`[call:${role}] setup starting, callId=${callId}`);

        (pc as any).addEventListener('icecandidate', (event: any) => {
          if (event.candidate) {
            console.log(`[call:${role}] local icecandidate: ${event.candidate.candidate}`);
            CallService.sendIceCandidate(callId, event.candidate.toJSON()).catch((err) =>
              console.warn('Failed to send ICE candidate:', err)
            );
          } else {
            console.log(`[call:${role}] local ICE gathering complete (null candidate)`);
          }
        });

        (pc as any).addEventListener('icegatheringstatechange', () => {
          console.log(`[call:${role}] icegatheringstatechange -> ${pc.iceGatheringState}`);
        });

        (pc as any).addEventListener('signalingstatechange', () => {
          console.log(`[call:${role}] signalingstatechange -> ${pc.signalingState}`);
        });

        (pc as any).addEventListener('connectionstatechange', () => {
          console.log(`[call:${role}] connectionstatechange -> ${pc.connectionState}`);
          if (cancelled) return;
          if (pc.connectionState === 'connected') {
            setPhase('active');
            setAudioOutput(false); // default to earpiece, not the native module's default
            beginTranscription();
          } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            handleRemoteCallEnded();
          }
        });

        // Belt-and-suspenders: on some @daily-co/react-native-webrtc builds
        // the aggregated `connectionState`/`connectionstatechange` above
        // doesn't fire reliably on Android even though ICE itself connects
        // fine, which left real, working calls stuck on "Connecting…"
        // forever. `iceConnectionState` is the older, more universally
        // implemented signal, so mirror the same transitions off it too —
        // whichever fires first wins, and setting phase twice is harmless.
        (pc as any).addEventListener('iceconnectionstatechange', () => {
          console.log(`[call:${role}] iceconnectionstatechange -> ${pc.iceConnectionState}`);
          if (cancelled) return;
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            setPhase('active');
            setAudioOutput(false); // default to earpiece, not the native module's default
            beginTranscription();
          } else if (pc.iceConnectionState === 'failed') {
            handleRemoteCallEnded();
          }
        });

        // Realtime: the other side's ICE candidates as they trickle in.
        const unsubIce = CallService.subscribeToIceCandidates(callId, (row) => {
          if (row.sender_id === userIdRef.current) return; // ignore our own echoed insert
          if (hasRemoteDescriptionRef.current) {
            console.log(`[call:${role}] adding remote candidate: ${row.candidate?.candidate}`);
            pc.addIceCandidate(new RTCIceCandidate(row.candidate))
              .then(() => console.log(`[call:${role}] remote candidate added OK`))
              .catch((err: any) => console.warn(`[call:${role}] Failed to add ICE candidate:`, err));
          } else {
            console.log(`[call:${role}] queuing remote candidate (no remote description yet)`);
            pendingRemoteCandidatesRef.current.push(row.candidate);
          }
        });
        cleanupFnsRef.current.push(unsubIce);

        // Realtime: call_sessions status/SDP changes.
        const unsubSession = CallService.subscribeToCallSession(callId, async (row: CallSession) => {
          if (cancelled) return;
          if (row.status === 'declined' || row.status === 'missed' || row.status === 'ended') {
            handleRemoteCallEnded();
            return;
          }
          // Caller's screen: the callee's answer arrives here.
          if (role === 'caller' && row.answer_sdp && !hasRemoteDescriptionRef.current) {
            await pc.setRemoteDescription(new RTCSessionDescription(row.answer_sdp as any));
            hasRemoteDescriptionRef.current = true;
            await flushPendingCandidates();
          }
        });
        cleanupFnsRef.current.push(unsubSession);

        if (role === 'caller') {
          setPhase('ringing');
          const offer = await pc.createOffer({});
          await pc.setLocalDescription(offer);
          await CallService.setOffer(callId, { type: offer.type, sdp: offer.sdp });

          // No-answer/no-connection timeout — handleRemoteCallEnded() marks
          // the call missed in the DB itself now, so both sides clean up.
          const timeout = setTimeout(() => {
            if (!cancelled && phaseRef.current !== 'active') {
              handleRemoteCallEnded();
            }
          }, 45000);
          cleanupFnsRef.current.push(() => clearTimeout(timeout));
        } else {
          const callRow = await CallService.getCallById(callId);
          if (!callRow || !callRow.offer_sdp) throw new Error('This call is no longer available.');
          await pc.setRemoteDescription(new RTCSessionDescription(callRow.offer_sdp as any));
          hasRemoteDescriptionRef.current = true;
          await flushPendingCandidates();

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await CallService.setAnswer(callId, { type: answer.type, sdp: answer.sdp });
        }
      } catch (err: any) {
        console.error('Call setup failed:', err);
        if (!cancelled) setErrorMessage(err?.message || 'Could not start the call.');
      }
    };

    setup();

    return () => {
      cancelled = true;
      cleanupAndLeave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, callId, role]);

  // Refs mirroring state so callbacks created once in the effect above always
  // see the latest values without needing to be re-created on every render.
  const userIdRef = useRef<string | undefined>(profile?.id);
  useEffect(() => {
    userIdRef.current = profile?.id;
  }, [profile?.id]);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Duration timer — only while actually connected.
  useEffect(() => {
    if (phase !== 'active') return;
    const timer = setInterval(() => setDuration((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track: any) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const toggleSpeaker = () => {
    const next = !isSpeakerOn;
    setAudioOutput(next);
    setIsSpeakerOn(next);
  };

  const statusText =
    errorMessage ? errorMessage : phase === 'active' ? formatDuration(duration) : phase === 'ringing' ? 'Ringing…' : 'Connecting…';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.status}>{statusText}</Text>
        {phase === 'active' && isTranscribing && (
          <Text style={styles.transcribingLabel}>🔴 Transcribing</Text>
        )}
      </View>

      <View style={styles.avatarContainer}>
        {counterpart?.profile_photo ? (
          <Image source={{ uri: counterpart.profile_photo }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <UserIcon size={80} color={colors.text_secondary} />
          </View>
        )}
        {phase === 'active' && <View style={styles.speakingIndicator} />}
      </View>

      <Text style={styles.name}>{counterpart?.full_name || 'Member'}</Text>

      {!errorMessage && (
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.controlButton, isMuted && styles.controlButtonActive]}
            onPress={toggleMute}
            activeOpacity={0.7}>
            {isMuted ? (
              <MicOff size={24} color={colors.text_primary} />
            ) : (
              <Mic size={24} color={colors.text_primary} />
            )}
            <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, isSpeakerOn && styles.controlButtonActive]}
            onPress={toggleSpeaker}
            activeOpacity={0.7}>
            <Volume2 size={24} color={colors.text_primary} />
            <Text style={styles.controlLabel}>{isSpeakerOn ? 'Speaker' : 'Earpiece'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'connecting' && !errorMessage && (
        <ActivityIndicator size="small" color={colors.accent_green_bright} style={styles.loader} />
      )}

      <TouchableOpacity style={styles.endCallButton} onPress={handleEndCall} activeOpacity={0.8}>
        <PhoneOff size={28} color={colors.text_primary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: 60,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl * 2,
  },
  status: {
    fontSize: fontSize.md,
    color: colors.text_secondary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  transcribingLabel: {
    fontSize: fontSize.sm,
    color: colors.text_secondary,
    textAlign: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  avatarPlaceholder: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#1A1F1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakingIndicator: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: 88,
    borderWidth: 4,
    borderColor: colors.accent_green,
  },
  name: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text_primary,
    marginBottom: spacing.xxl * 2,
  },
  controls: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginBottom: spacing.md,
  },
  controlButton: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  controlButtonActive: {
    opacity: 0.5,
  },
  controlLabel: {
    fontSize: fontSize.sm,
    color: colors.text_secondary,
  },
  loader: {
    marginBottom: spacing.md,
  },
  endCallButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.danger_red,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
  },
});
