export type VerticalType = 'inner_circle' | 'open_circle';
export type MembershipType = 'regular' | 'privileged';
export type MembershipStatus = 'active' | 'expired' | 'suspended' | 'resigned' | 'terminated';
export const BLOCKED_MEMBER_STATUSES: MembershipStatus[] = ['resigned', 'expired', 'terminated'];
export type LinkStatus = 'open' | 'closed';
export type AttendanceStatus = 'normal' | 'probation' | 'category_open' | 'removal_eligible';

export interface UserProfile {
  id: string;
  full_name: string;
  phone_number: string | null;
  vertical_type: VerticalType | null;
  country: string | null;
  state: string | null;
  city: string | null;
  business_category: string | null;
  house_id?: string | null;
  zone?: string | null;
  business?: string | null;
  industry?: string | null;
  house?: CoreHouse | null;
  attendance_status: AttendanceStatus;
  absence_count: number;
  is_suspended: boolean;
  membership_status?: string | null;
  membership_code?: string | null;
  /** Date of joining (YYYY-MM-DD), from the official members sheet. */
  member_since?: string | null;
  profile_photo?: string | null;
  ai_consent?: 'accepted' | 'declined' | null;
  created_at: string;
}

export interface CoreMembership {
  id: string;
  user_id: string;
  membership_type: MembershipType;
  membership_status: MembershipStatus;
  valid_from: string;
  valid_to: string | null;
  financial_year: string;
  created_at: string;
}

export interface VirtualMembership {
  id: string;
  user_id: string;
  membership_status: 'active' | 'expired';
  valid_from: string;
  valid_to: string;
  financial_year: string;
  created_at: string;
}

export interface CoreHouse {
  id: string;
  house_name: string;
  city: string;
  state: string;
  country: string;
  created_at: string;
}

export interface CoreHouseMember {
  id: string;
  user_id: string;
  house_id: string;
  role: string | null;
  created_at: string;
}

export interface CoreLink {
  id: string;
  from_user_id: string;
  to_user_id: string;
  title: string;
  description: string | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  urgency: number;
  house_id: string;
  status: LinkStatus;
  created_at: string;
}

export interface CoreDeal {
  id: string;
  creator_id: string;
  from_member_id: string | null;
  to_member_id: string | null;
  house_id: string | null;
  title: string;
  description: string | null;
  amount: number;
  deal_type: 'house_deal' | 'wevysya_deal';
  status: 'open' | 'in_progress' | 'completed' | 'closed';
  created_at: string;
}

export interface DealParticipant {
  id: string;
  deal_id: string;
  user_id: string;
  role: 'creator' | 'participant';
  joined_at: string;
}

export interface CoreI2We {
  id: string;
  member_1_id: string;
  member_2_id: string;
  house_id: string;
  meeting_date: string;
  notes: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  created_at: string;
}

export type ConnectionStatus = 'pending' | 'accepted' | 'declined';

export interface CoreConnection {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: ConnectionStatus;
  requester_contact_consent: boolean;
  recipient_contact_consent: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  connection_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export type CallSessionStatus = 'ringing' | 'active' | 'declined' | 'missed' | 'ended';

export interface CallSession {
  id: string;
  connection_id: string;
  caller_id: string;
  callee_id: string;
  status: CallSessionStatus;
  offer_sdp: RTCSessionDescriptionInitLike | null;
  answer_sdp: RTCSessionDescriptionInitLike | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Plain-object shape of an RTCSessionDescription, as stored in JSONB (avoids
 *  depending on react-native-webrtc's own types from this shared types file). */
export interface RTCSessionDescriptionInitLike {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp: string;
}

export interface CallIceCandidate {
  id: string;
  call_id: string;
  sender_id: string;
  candidate: Record<string, any>;
  created_at: string;
}

/** One speaker's transcribed segment of a call — see callTranscriptService.ts. */
export interface CallTranscript {
  id: string;
  call_id: string;
  speaker_id: string;
  text: string;
  created_at: string;
}

export interface Channel {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  category: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ChannelPost {
  id: string;
  channel_id: string;
  user_id: string;
  title: string;
  content: string;
  post_type: string;
  metadata: Record<string, any>;
  status: 'active' | 'closed' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface PostAuthor {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  membership_code: string | null;
  city: string | null;
  state: string | null;
  business_category: string | null;
}

export interface ChannelPostWithAuthor extends ChannelPost {
  author: PostAuthor | null;
}

export interface ChannelPostReaction {
  post_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
}

export interface ChannelPostComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author: PostAuthor | null;
}
