import { NativeModules, Platform } from 'react-native';

/**
 * @daily-co/react-native-webrtc is a native-module package (no "browser"
 * field / web stub) — statically importing it would break the web build.
 * On web, the browser's own built-in WebRTC globals are used instead (no
 * package needed); on native, this package supplies the same standard
 * RTCPeerConnection/RTCIceCandidate/RTCSessionDescription/getUserMedia API.
 * Mirrors the exact platform-split pattern services/vapiService.ts already
 * uses for @vapi-ai/web vs @vapi-ai/react-native.
 */
export function getWebRTCGlobals(): {
  RTCPeerConnection: any;
  RTCIceCandidate: any;
  RTCSessionDescription: any;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<any>;
} {
  if (Platform.OS === 'web') {
    return {
      RTCPeerConnection: (globalThis as any).RTCPeerConnection,
      RTCIceCandidate: (globalThis as any).RTCIceCandidate,
      RTCSessionDescription: (globalThis as any).RTCSessionDescription,
      getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const webrtc = require('@daily-co/react-native-webrtc');
  return {
    RTCPeerConnection: webrtc.RTCPeerConnection,
    RTCIceCandidate: webrtc.RTCIceCandidate,
    RTCSessionDescription: webrtc.RTCSessionDescription,
    getUserMedia: (constraints) => webrtc.mediaDevices.getUserMedia(constraints),
  };
}

/**
 * Switches the in-call audio output between the earpiece and loudspeaker.
 * @daily-co/react-native-webrtc's native WebRTCModule already implements
 * this (Android: DailyWebRTCDevicesManager.setAudioDevice, iOS: the
 * equivalent AVAudioSession-based method — same native module name and
 * same 'SPEAKERPHONE'/'WIRED_OR_EARPIECE' device-id strings on both
 * platforms), it's just never exposed through the package's own JS
 * wrapper, so this calls it directly via NativeModules. No-op on web,
 * where the browser owns output-device selection itself.
 */
export function setAudioOutput(speakerOn: boolean): void {
  if (Platform.OS === 'web') return;
  const deviceId = speakerOn ? 'SPEAKERPHONE' : 'WIRED_OR_EARPIECE';
  NativeModules.WebRTCModule?.setAudioDevice(deviceId);
}
