import { supabase } from '@/lib/supabase';
import { getSummarizeTextEndpoint, fetchWithErrorHandling } from '@/lib/apiConfig';
import { voiceOS } from './voiceOSService';

export interface VoiceNote {
  id: string;
  user_id: string;
  related_i2we_id: string | null;
  type: 'note' | 'meeting_summary';
  title: string;
  transcript: string;
  summary: string | null;
  action_items: string[] | null;
  tags: string[] | null;
  created_at: string;
}

interface CreateVoiceNoteOptions {
  title: string;
  type?: 'note' | 'meeting_summary';
  relatedI2weId?: string;
}

/**
 * Voice Notes / Meeting Companion: record -> transcribe (reusing voiceOSService's
 * existing STT) -> summarize -> persist transcript + summary only (no raw audio).
 * "Summarize this meeting" is just this service used with type: 'meeting_summary'.
 */
class VoiceNotesService {
  async startRecording(): Promise<void> {
    await voiceOS.startRecording();
  }

  async stopRecordingAndSave(options: CreateVoiceNoteOptions): Promise<VoiceNote> {
    const transcript = await voiceOS.stopRecordingAndTranscribe();
    return this.createFromTranscript(transcript, options);
  }

  async createFromTranscript(transcript: string, options: CreateVoiceNoteOptions): Promise<VoiceNote> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let summary: string | null = null;
    let actionItems: string[] | null = null;

    try {
      const result = await fetchWithErrorHandling<{ summary: string; action_items: string[] }>(
        getSummarizeTextEndpoint(),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript }),
        }
      );
      summary = result.summary || null;
      actionItems = result.action_items?.length ? result.action_items : null;
    } catch (error) {
      console.warn('⚠️ Summarization failed, saving transcript without summary:', error);
    }

    const { data, error } = await supabase
      .from('voice_notes')
      .insert({
        user_id: user.id,
        related_i2we_id: options.relatedI2weId || null,
        type: options.type || 'note',
        title: options.title,
        transcript,
        summary,
        action_items: actionItems,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getMyVoiceNotes(): Promise<VoiceNote[]> {
    const { data, error } = await supabase
      .from('voice_notes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getVoiceNoteById(id: string): Promise<VoiceNote | null> {
    const { data, error } = await supabase
      .from('voice_notes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async deleteVoiceNote(id: string): Promise<void> {
    const { error } = await supabase.from('voice_notes').delete().eq('id', id);
    if (error) throw error;
  }
}

export const voiceNotesService = new VoiceNotesService();
