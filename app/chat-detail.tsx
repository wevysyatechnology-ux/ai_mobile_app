import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Linking,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Send, User as UserIcon, Phone, History } from 'lucide-react-native';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { ChatService } from '@/services/chatService';
import { CallService } from '@/services/callService';
import { ConnectionsService, ConnectionSummary, CounterpartProfile } from '@/services/connectionsService';
import { ChatMessage, CoreConnection } from '@/types/database';
import { buildWhatsAppLink } from '@/utils/phone';

import { keyboardDismissProps } from '@/hooks/useFormFields';
export default function ChatDetailScreen() {
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ connectionId?: string }>();
  const connectionId = params.connectionId || '';

  const [connection, setConnection] = useState<ConnectionSummary | null>(null);
  const [counterpart, setCounterpart] = useState<CounterpartProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [startingCall, setStartingCall] = useState(false);
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);
  const listRef = useRef<FlatList>(null);

  // On Android with edge-to-edge enabled (default since Expo SDK 54 / RN 0.81),
  // KeyboardAvoidingView's built-in height calculation is unreliable and the
  // composer ends up hidden behind the keyboard. Track the real keyboard
  // height directly from the OS event instead and shift the composer up by
  // that amount ourselves. iOS keeps using KeyboardAvoidingView's "padding"
  // behavior, which already works correctly, so this stays a no-op there.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKeyboardHeight(e.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleStartCall = async () => {
    if (!connectionId || startingCall) return;
    setStartingCall(true);
    try {
      const call = await CallService.startCall(connectionId);
      router.push({ pathname: '/call', params: { callId: call.id, connectionId, role: 'caller' } });
    } catch (error: any) {
      Alert.alert('Could not start call', error?.message || 'Please try again.');
    } finally {
      setStartingCall(false);
    }
  };

  const myConsent = (c: ConnectionSummary | null) =>
    c ? (c.isRequester ? c.requester_contact_consent : c.recipient_contact_consent) : false;
  const theirConsent = (c: ConnectionSummary | null) =>
    c ? (c.isRequester ? c.recipient_contact_consent : c.requester_contact_consent) : false;

  const loadEverything = useCallback(async () => {
    if (!connectionId) {
      setLoading(false);
      return;
    }
    try {
      const [conn, profiles, msgs] = await Promise.all([
        ConnectionsService.getConnectionById(connectionId),
        ConnectionsService.getCounterpartProfiles([connectionId]),
        ChatService.getMessages(connectionId),
      ]);
      setConnection(conn);
      setCounterpart(profiles[connectionId] || null);
      setMessages(msgs);

      if (conn && conn.requester_contact_consent && conn.recipient_contact_consent) {
        const phone = await ConnectionsService.getContactInfo(connectionId);
        setContactPhone(phone);
      }
    } catch (error) {
      console.error('Failed to load chat:', error);
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    loadEverything();
  }, [loadEverything]);

  // Live message delivery + live consent/status updates, both cleaned up on
  // unmount — mirrors app/channel-detail.tsx's realtime subscribe pattern,
  // not components/shared/NotificationBell.tsx's leaky one.
  useEffect(() => {
    if (!connectionId) return;

    const unsubscribeMessages = ChatService.subscribeToMessages(connectionId, (message) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    });

    const unsubscribeConnection = ConnectionsService.subscribeToConnection(connectionId, async (row) => {
      setConnection((prev) => (prev ? { ...prev, ...row } : prev));
      if (row.requester_contact_consent && row.recipient_contact_consent) {
        try {
          const phone = await ConnectionsService.getContactInfo(connectionId);
          setContactPhone(phone);
        } catch (error) {
          console.error('Failed to fetch contact info after consent update:', error);
        }
      }
    });

    return () => {
      unsubscribeMessages();
      unsubscribeConnection();
    };
  }, [connectionId]);

  const handleSend = async () => {
    const body = input.trim();
    if (!body || !connection) return;

    // Close the keyboard once the message is sent so the conversation is visible and scrollable.
    Keyboard.dismiss();
    setSending(true);
    setInput('');
    try {
      const message = await ChatService.sendMessage(
        connectionId,
        body,
        connection.counterpartId,
        profile?.full_name || 'A member'
      );
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not send message.');
      setInput(body);
    } finally {
      setSending(false);
    }
  };

  const handleRequestConsent = async () => {
    if (!connection) return;
    setConsentLoading(true);
    try {
      await ConnectionsService.setContactConsent(connection.id, true);
      const updated = await ConnectionsService.getConnectionById(connection.id);
      setConnection(updated);
      if (updated && updated.requester_contact_consent && updated.recipient_contact_consent) {
        const phone = await ConnectionsService.getContactInfo(connection.id);
        setContactPhone(phone);
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not update contact consent.');
    } finally {
      setConsentLoading(false);
    }
  };

  const openWhatsApp = () => {
    if (!contactPhone) return;
    Linking.openURL(buildWhatsAppLink(contactPhone)).catch(() =>
      Alert.alert('Unable to open WhatsApp', 'Could not open WhatsApp for this number.')
    );
  };

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="small" color={colors.accent_green_bright} />
      </View>
    );
  }

  if (!connection || connection.status !== 'accepted') {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.emptyStateText}>This chat isn't available.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const iConsented = myConsent(connection);
  const theyConsented = theirConsent(connection);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text_primary} />
        </TouchableOpacity>
        {counterpart?.profile_photo ? (
          <Image source={{ uri: counterpart.profile_photo }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <UserIcon size={18} color={colors.text_secondary} />
          </View>
        )}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {counterpart?.full_name || 'Member'}
        </Text>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/call-history', params: { connectionId } })}
          style={styles.callButton}>
          <History size={19} color={colors.text_secondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleStartCall} style={styles.callButton} disabled={startingCall}>
          {startingCall ? (
            <ActivityIndicator size="small" color={colors.accent_green_bright} />
          ) : (
            <Phone size={20} color={colors.accent_green_bright} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.consentBanner}>
        {contactPhone ? (
          <View style={styles.consentRow}>
            <Text style={styles.consentText}>Contact: {contactPhone}</Text>
            <TouchableOpacity style={styles.whatsappButton} onPress={openWhatsApp}>
              <Text style={styles.whatsappButtonText}>Chat on WhatsApp</Text>
            </TouchableOpacity>
          </View>
        ) : iConsented && theyConsented ? (
          <Text style={styles.consentText}>Loading contact info…</Text>
        ) : iConsented && !theyConsented ? (
          <Text style={styles.consentText}>
            Waiting for {counterpart?.full_name || 'them'} to agree to exchange contact info.
          </Text>
        ) : !iConsented && theyConsented ? (
          <TouchableOpacity
            style={styles.consentButton}
            disabled={consentLoading}
            onPress={handleRequestConsent}>
            {consentLoading ? (
              <ActivityIndicator size="small" color={colors.bg_primary} />
            ) : (
              <Text style={styles.consentButtonText}>
                {counterpart?.full_name || 'They'} want to exchange contact info — Accept?
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.consentButton}
            disabled={consentLoading}
            onPress={handleRequestConsent}>
            {consentLoading ? (
              <ActivityIndicator size="small" color={colors.bg_primary} />
            ) : (
              <Text style={styles.consentButtonText}>Request to exchange contact info</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={keyboardDismissProps.keyboardDismissMode}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const isMine = item.sender_id === user?.id;
          return (
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
              <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{item.body}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyStateText}>Say hello to start the conversation.</Text>
        }
      />

      <View
        style={[
          styles.composerRow,
          { paddingBottom: Math.max(insets.bottom, spacing.md), marginBottom: androidKeyboardHeight },
        ]}>
        <TextInput
          style={styles.composerInput}
          placeholder="Type a message…"
          placeholderTextColor={colors.text_secondary}
          value={input}
          onChangeText={setInput}
          multiline
          // Return sends the message and closes the keyboard (instead of adding a new line).
          returnKeyType="send"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending}>
          {sending ? (
            <ActivityIndicator size="small" color={colors.bg_primary} />
          ) : (
            <Send size={18} color={colors.bg_primary} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg_primary,
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: colors.bg_primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  backLink: {
    padding: spacing.sm,
  },
  backLinkText: {
    color: colors.accent_green_bright,
    fontFamily: 'Poppins-Medium',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg_secondary,
  },
  backButton: {
    padding: spacing.xs,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg_card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text_primary,
  },
  callButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent_green_bright + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentBanner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  consentText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: colors.text_secondary,
    flex: 1,
  },
  consentButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.accent_green_bright,
    alignItems: 'center',
  },
  consentButtonText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    color: colors.bg_primary,
    textAlign: 'center',
  },
  whatsappButton: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    backgroundColor: '#25D366',
  },
  whatsappButtonText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    color: '#0B1B0F',
  },
  messageList: {
    padding: spacing.lg,
    gap: spacing.sm,
    flexGrow: 1,
  },
  emptyStateText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: colors.text_secondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  bubble: {
    maxWidth: '80%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    marginBottom: spacing.xs,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent_green_bright,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bg_card,
    borderBottomLeftRadius: 4,
  },
  bubbleTextMine: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.bg_primary,
  },
  bubbleTextTheirs: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.text_primary,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  composerInput: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: colors.bg_card,
    borderRadius: 20,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.text_primary,
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent_green_bright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.bg_secondary,
  },
});
