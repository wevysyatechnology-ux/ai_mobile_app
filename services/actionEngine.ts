import { supabase } from '@/lib/supabase';
import { fetchWithErrorHandling } from '@/lib/apiConfig';
import ActivityQueryService from './activityQueryService';
import { searchMembers as searchMembersService } from './memberSearchService';
import { EventsService } from './eventsService';
import { getSuggestedConnections } from './networkingService';

const getClassifyIntentEndpoint = () => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  return `${supabaseUrl}/functions/v1/classify-intent`;
};

export interface Intent {
  type: 'knowledge' | 'action';
  category?: string;
  action?: {
    name: string;
    parameters: Record<string, any>;
    screen?: string;
  };
  response: string; // The text spoken back to the user
  confidence: number;
}

/**
 * Build the navigation target for a voice-driven action, attaching query params
 * for search_member so the Discover screen can prefill and run the search
 * (e.g. "find a CA in Bengaluru" -> /(tabs)/discover?q=CA&category=CA&city=Bengaluru).
 */
export function buildActionRoute(action: NonNullable<Intent['action']>): string {
  if (!action.screen) return '';
  if (action.name === 'search_member') {
    const { profession, location, keyword } = action.parameters || {};
    const params = new URLSearchParams();
    if (profession) params.set('category', profession);
    if (location) params.set('city', location);
    if (keyword) params.set('keyword', keyword);
    if (profession || location || keyword) params.set('q', profession || keyword || location);
    const qs = params.toString();
    return qs ? `${action.screen}?${qs}` : action.screen;
  }
  return action.screen;
}

/**
 * 🎯 Action Engine
 * 
 * Classifies user intent and determines appropriate actions
 * Uses GPT to understand natural language and extract structured intents
 */
class ActionEngine {
  private actionMap: Map<string, any> = new Map();

  constructor() {
    this.initializeActions();
  }

  /**
   * Initialize available actions
   */
  private initializeActions(): void {
    // Member actions
    this.actionMap.set('search_member', {
      handler: this.searchMembers,
      screen: '/(tabs)/discover',
      description: 'Search for members by profession or location',
    });

    // Deal actions
    this.actionMap.set('post_deal', {
      handler: this.postDeal,
      screen: '/deals-form',
      description: 'Create and post a new business deal',
    });

    this.actionMap.set('view_deals', {
      handler: this.viewDeals,
      screen: '/(tabs)/activity',
      description: 'View all available deals',
    });

    // Link actions
    this.actionMap.set('send_link', {
      handler: this.sendLink,
      screen: '/links-form',
      description: 'Send a link request to connect people',
    });

    // i2We actions
    this.actionMap.set('create_i2we', {
      handler: this.createI2We,
      screen: '/i2we-form',
      description: 'Create an i2We connection request',
    });

    this.actionMap.set('create_voice_note', {
      handler: this.createVoiceNote,
      screen: '/voice-notes',
      description: 'Take a voice note or summarize a meeting',
    });

    // Profile actions
    this.actionMap.set('view_profile', {
      handler: this.viewProfile,
      screen: '/(tabs)/profile',
      description: 'View your profile',
    });

    // Channel actions
    this.actionMap.set('view_channels', {
      handler: this.viewChannels,
      screen: '/channels',
      description: 'Browse available channels',
    });

    // Activity actions
    this.actionMap.set('view_activity', {
      handler: this.viewActivity,
      screen: '/(tabs)/activity',
      description: 'View recent activity',
    });

    // Database query actions
    this.actionMap.set('query_house_members', {
      handler: this.queryHouseMembers,
      description: 'Query the database for the number of members in the user\'s house',
    });

    this.actionMap.set('query_events', {
      handler: this.queryEvents,
      description: 'Query upcoming house events',
    });

    this.actionMap.set('networking_suggestions', {
      handler: this.networkingSuggestions,
      description: 'Suggest new connections (same house, complementary profession, not already linked)',
    });

    // Activity stats queries (read-only)
    this.actionMap.set('query_links_stats', {
      handler: this.queryLinksStats,
      description: 'Query link counts for the current user',
    });
    this.actionMap.set('query_deals_stats', {
      handler: this.queryDealsStats,
      description: 'Query deal counts for the current user',
    });
    this.actionMap.set('query_i2we_stats', {
      handler: this.queryI2weStats,
      description: 'Query i2We meeting counts for the current user',
    });
    this.actionMap.set('query_all_activity_stats', {
      handler: this.queryAllActivityStats,
      description: 'Query all activity (links + deals + i2We) counts for the current user',
    });
  }

  /**
   * Classify user intent using GPT via backend proxy
   * Returns structured intent with action parameters
   */
  async classifyIntent(query: string, context: string = ''): Promise<Intent> {
    try {
      console.log('🎯 Classifying intent for:', query);

      // Get Supabase anon key for authorization
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

      // Call backend proxy for intent classification
      const intentData = await fetchWithErrorHandling<any>(
        getClassifyIntentEndpoint(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            query,
            context,
          }),
        }
      );

      // Build structured intent
      const intent: Intent = {
        type: intentData.type || 'knowledge',
        category: intentData.category,
        response: intentData.response || 'I can help you with that.',
        confidence: intentData.confidence || 0.5,
      };

      // If it's an action, add action details
      if (intent.type === 'action' && intent.category) {
        const actionConfig = this.actionMap.get(intent.category);
        if (actionConfig) {
          intent.action = {
            name: intent.category,
            parameters: intentData.parameters || {},
            screen: actionConfig.screen,
          };
        }
      }

      console.log('✅ Intent classified from backend:', intent.type, intent.category);
      return intent;
    } catch (error) {
      console.error('❌ Intent classification failed:', error);
      // Fallback to simple keyword matching
      return this.fallbackIntentClassification(query);
    }
  }

  /**
   * Ultra-fast local intent classification using regex/keywords
   * Bypasses OpenAI completely for common commands
   */
  fastLocalClassification(query: string): Intent | null {
    const q = query.toLowerCase().trim();

    // ── 0. Greetings & small talk ──────────────────────────────────────────
    if (/^(hi|hello|hey|namaste|namaskar|hii+|hlo|yo)\b/.test(q) && q.length < 30) {
      return {
        type: 'knowledge',
        category: 'greeting',
        response: 'Hello! I\'m WeVysya Assistant. How can I help you today?',
        confidence: 0.99,
      };
    }
    if (/how are you|kaisa hai|kya haal|kya chal/.test(q)) {
      return {
        type: 'knowledge',
        category: 'greeting',
        response: 'I\'m doing great, thank you for asking! How can I assist you?',
        confidence: 0.99,
      };
    }
    if (/thank(s| you)|shukriya|dhanyavaad|shukriya/.test(q)) {
      return {
        type: 'knowledge',
        category: 'thanks',
        response: 'You\'re welcome! Is there anything else I can help you with?',
        confidence: 0.99,
      };
    }
    if (/^(good morning|good afternoon|good evening|subh prabhat|shubh sandhya)\b/.test(q) && q.length < 30) {
      return {
        type: 'knowledge',
        category: 'greeting',
        response: 'Hello! How can I help you today?',
        confidence: 0.97,
      };
    }
    if (/^(bye|goodbye|see you|alvida|phir milenge|tata)\b/.test(q) && q.length < 30) {
      return {
        type: 'knowledge',
        category: 'greeting',
        response: 'Goodbye! Talk to you soon.',
        confidence: 0.97,
      };
    }
    if (/what can you do|what.*help.*with|how.*you.*help|tum kya kar sakte ho|aap kya kar sakte hain|kya kar sakti ho/.test(q)) {
      return {
        type: 'knowledge',
        category: 'help',
        response: 'I can help you find members, post deals, send links, create i2We requests, check your activity, and answer questions about WeVysya. Just ask naturally!',
        confidence: 0.95,
      };
    }

    // ── 1. Profile ──────────────────────────────────────────────────────────
    if (
      /show.*profile|open.*profile|my.*profile|view.*profile|mera.*profile|profile.*dikhao|profile.*dikhaiye/.test(q) ||
      /मेरी.*प्रोफाइल|प्रोफाइल.*दिखाओ|प्रोफाइल.*दिखाइए/.test(q) ||
      /என்.*profile|profile.*காட்டு/.test(q) ||
      /నా.*profile|profile.*చూపించు/.test(q) ||
      /ನನ್ನ.*profile|profile.*ತೋರಿಸು/.test(q) ||
      /എന്റെ.*profile|profile.*കാണിക്കൂ/.test(q)
    ) {
      return {
        type: 'action',
        category: 'view_profile',
        action: { name: 'view_profile', parameters: {}, screen: '/(tabs)/profile' },
        response: 'Opening your profile.',
        confidence: 0.95,
      };
    }

    // ── 2. Deals ────────────────────────────────────────────────────────────
    if (/post.*deal|create.*deal|add.*deal|deal.*post|deal.*banao|naya.*deal/.test(q)) {
      return {
        type: 'action',
        category: 'post_deal',
        action: { name: 'post_deal', parameters: {}, screen: '/deals-form' },
        response: 'Opening the deal creation form.',
        confidence: 0.95,
      };
    }
    if (/show.*deals?|view.*deals?|open.*deals?|deals?.*dikhao|deals?.*dekho/.test(q)) {
      return {
        type: 'action',
        category: 'view_deals',
        action: { name: 'view_deals', parameters: {}, screen: '/(tabs)/activity' },
        response: 'Showing the latest deals.',
        confidence: 0.95,
      };
    }

    // ── 3. Activity ─────────────────────────────────────────────────────────
    if (/show.*activity|view.*activity|open.*activity/.test(q)) {
      return {
        type: 'action',
        category: 'view_activity',
        action: { name: 'view_activity', parameters: {}, screen: '/(tabs)/activity' },
        response: 'Opening your recent activity.',
        confidence: 0.95,
      };
    }

    // ── 4. House members query ──────────────────────────────────────────────
    if (/how many.*members|members.*count|kitne.*members|members.*kitne|ghar.*members/.test(q)) {
      return {
        type: 'action',
        category: 'query_house_members',
        action: { name: 'query_house_members', parameters: {} },
        response: 'Let me check the database for your house members.',
        confidence: 0.95,
      };
    }

    // ── 4b. Links stats — all 6 languages ───────────────────────────────────
    if (
      // English
      /how many.*link|link.*count|my.*link.*count|link.*stat/.test(q) ||
      // Hindi Devanagari + Hinglish romanized (ginti/count + link subject)
      /गिनती.*लिंक|लिंक.*गिनती|कितने.*लिंक|लिंक.*कितने|मेरे.*लिंक|मेरी.*लिंक|लिंक.*दिखाइए/.test(q) ||
      /kitne.*link|link.*kitne|meri.*link|link.*ki.*ginti|link.*ki.*count|ginti.*link|link.*ginti|links.*batao|link.*ke.*baare/.test(q) ||
      // Tamil native + romanized
      /எத்தனை.*link|என்.*link|link.*காட்டு|மொத்தம்.*link|ethanai.*link|en.*link.*kaattu/.test(q) ||
      // Telugu native + romanized
      /ఎన్ని.*link|నా.*link|link.*చూపించు|మొత్తం.*link|enni.*link|naa.*link|link.*chupinchu/.test(q) ||
      // Kannada native + romanized
      /ಎಷ್ಟು.*link|ನನ್ನ.*link|link.*ತೋರಿಸು|ಒಟ್ಟು.*link|eshtu.*link|nanna.*link|link.*thorisu/.test(q) ||
      // Malayalam native + romanized
      /എത്ര.*link|എന്റെ.*link|link.*കാണിക്കൂ|മൊത്തം.*link|ethra.*link|ente.*link|link.*kaanikkoo/.test(q)
    ) {
      return {
        type: 'action',
        category: 'query_links_stats',
        action: { name: 'query_links_stats', parameters: {} },
        response: 'Let me check your link activity.',
        confidence: 0.95,
      };
    }

    // ── 4c. Deals stats — all 6 languages ───────────────────────────────────
    if (
      // English
      /how many.*deal|deal.*count|my.*deal.*count|deal.*stat/.test(q) ||
      // Hindi Devanagari + Hinglish romanized
      /गिनती.*डील|डील.*गिनती|कितने.*डील|डील.*कितने|मेरे.*डील|मेरी.*डील|डील.*दिखाइए/.test(q) ||
      /kitne.*deal|deal.*kitne|meri.*deal|deal.*ki.*ginti|deal.*ki.*count|ginti.*deal|deal.*ginti|deals.*batao|deal.*ke.*baare/.test(q) ||
      // Tamil native + romanized
      /எத்தனை.*deal|என்.*deal|deal.*காட்டு|ethanai.*deal|en.*deal/.test(q) ||
      // Telugu native + romanized
      /ఎన్ని.*deal|నా.*deal|deal.*చూపించు|enni.*deal|naa.*deal/.test(q) ||
      // Kannada native + romanized
      /ಎಷ್ಟು.*deal|ನನ್ನ.*deal|deal.*ತೋರಿಸು|eshtu.*deal|nanna.*deal/.test(q) ||
      // Malayalam native + romanized
      /എത്ര.*deal|എന്റെ.*deal|deal.*കാണിക്കൂ|ethra.*deal|ente.*deal/.test(q)
    ) {
      return {
        type: 'action',
        category: 'query_deals_stats',
        action: { name: 'query_deals_stats', parameters: {} },
        response: 'Let me check your deal activity.',
        confidence: 0.95,
      };
    }

    // ── 4d. i2We stats — all 6 languages ────────────────────────────────────
    if (
      // English
      /how many.*i2We|i2we.*count|meeting.*count|how many.*meeting/.test(q) ||
      // Hindi Devanagari + Hinglish romanized
      /गिनती.*i2We|i2we.*गिनती|कितने.*i2We|मीटिंग.*गिनती|कितनी.*मीटिंग|मेरी.*मीटिंग/.test(q) ||
      /kitne.*i2We|i2we.*kitne|kitni.*meeting|i2we.*ki.*ginti|meeting.*ki.*ginti|ginti.*i2We|i2we.*ginti|i2we.*batao|i2we.*ke.*baare/.test(q) ||
      // Tamil native + romanized
      /எத்தனை.*i2We|எத்தனை.*meeting|i2we.*காட்டு|ethanai.*i2We|ethanai.*meeting/.test(q) ||
      // Telugu native + romanized
      /ఎన్ని.*i2We|ఎన్ని.*meeting|i2we.*చూపించు|enni.*i2We|enni.*meeting/.test(q) ||
      // Kannada native + romanized
      /ಎಷ್ಟು.*i2We|ಎಷ್ಟು.*meeting|i2we.*ತೋರಿಸು|eshtu.*i2We|eshtu.*meeting/.test(q) ||
      // Malayalam native + romanized
      /എത്ര.*i2We|എത്ര.*meeting|i2we.*കാണിക്കൂ|ethra.*i2We|ethra.*meeting/.test(q)
    ) {
      return {
        type: 'action',
        category: 'query_i2we_stats',
        action: { name: 'query_i2we_stats', parameters: {} },
        response: 'Let me check your i2We meeting activity.',
        confidence: 0.95,
      };
    }

    // ── 4e. All activity summary — ONLY when NO specific subject mentioned ─────
    // Guard: skip this rule if query contains a specific subject (link/deal/i2we/meeting)
    // so "links ki ginti" never triggers all-activity.
    const hasSpecificSubject = /link|deal|i2We|meeting/i.test(q);
    if (
      !hasSpecificSubject &&
      (
        // English / Hinglish
        /my.*activity|activity.*summary|meri.*activity|total.*activity|sab.*activity|overall.*stat|result.*dikhao|count.*dikhao|count.*karo/.test(q) ||
        // Hindi Devanagari (bare count word — only when no subject)
        /गिनती|गिनकर|संख्या.*बताओ|सब.*दिखाइए|सभी.*दिखाइए|सब.*दिखाओ|सभी.*दिखाओ|कितना.*है|activity.*दिखाओ/.test(q) ||
        // Tamil native + romanized
        /எண்ணிக்கை|மொத்தம்.*காட்டு|எல்லாம்.*காட்டு|காட்டுங்கள்|mottham.*kaattu|ellam.*kaattu|kaattungal|ennikkai/.test(q) ||
        // Telugu native + romanized
        /లెక్క.*చూపించు|మొత్తం.*చూపించు|అన్నీ.*చూపించు|lekka.*chupinchu|mottam.*chupinchu|anni.*cheppu/.test(q) ||
        // Kannada native + romanized
        /ಸಂಖ್ಯೆ.*ತೋರಿಸು|ಒಟ್ಟು.*ತೋರಿಸು|ಎಲ್ಲಾ.*ತೋರಿಸು|sankhye.*thorisu|ottu.*thorisu|ella.*thorisu/.test(q) ||
        // Malayalam native + romanized
        /എണ്ണം.*കാണിക്കൂ|മൊത്തം.*കാണിക്കൂ|എല്ലാം.*കാണിക്കൂ|ennam.*kaanikkoo|mottham.*kaanikkoo|ellam.*kaanikkoo/.test(q)
      )
    ) {
      return {
        type: 'action',
        category: 'query_all_activity_stats',
        action: { name: 'query_all_activity_stats', parameters: {} },
        response: 'Fetching your complete activity summary.',
        confidence: 0.92,
      };
    }

    // ── 5. Links ────────────────────────────────────────────────────────────
    if (/send.*link|give.*link|create.*link|link.*bhejo|link.*request/.test(q)) {
      return {
        type: 'action',
        category: 'send_link',
        action: { name: 'send_link', parameters: {}, screen: '/links-form' },
        response: 'Opening the link request form.',
        confidence: 0.90,
      };
    }
    if (/show.*links?|view.*links?|open.*links?/.test(q)) {
      return {
        type: 'action',
        category: 'view_links',
        action: { name: 'view_links', parameters: {}, screen: '/(tabs)/activity' },
        response: 'Showing your links.',
        confidence: 0.88,
      };
    }

    // ── 6. i2We ─────────────────────────────────────────────────────────────
    if (/create.*i2we|start.*i2we|i2we.*banao|new.*i2we/.test(q)) {
      return {
        type: 'action',
        category: 'create_i2we',
        action: { name: 'create_i2we', parameters: {}, screen: '/i2we-form' },
        response: 'Opening the i2We creation form.',
        confidence: 0.90,
      };
    }

    // ── 6b. Voice Notes / Meeting Companion ─────────────────────────────────
    if (
      /take.*note|make.*note|record.*note|new.*note|note.*banao|note.*lo|nott.*banao|summarize.*meeting|meeting.*summary|meeting.*summarize|note.*likho/.test(q)
    ) {
      return {
        type: 'action',
        category: 'create_voice_note',
        action: { name: 'create_voice_note', parameters: {}, screen: '/voice-notes' },
        response: 'Opening voice notes for you.',
        confidence: 0.88,
      };
    }

    // ── 7. Channels ─────────────────────────────────────────────────────────
    if (
      /show.*channels?|open.*channels?|view.*channels?|channels?.*dikhao|channels?.*dikhaiye/.test(q) ||
      /चैनल.*दिखाओ|चैनल.*दिखाइए|सभी.*चैनल/.test(q) ||
      /channels?.*காட்டு/.test(q) ||
      /channels?.*చూపించు/.test(q) ||
      /channels?.*ತೋರಿಸು/.test(q) ||
      /channels?.*കാണിക്കൂ/.test(q)
    ) {
      return {
        type: 'action',
        category: 'view_channels',
        action: { name: 'view_channels', parameters: {}, screen: '/channels' },
        response: 'Opening channels for you.',
        confidence: 0.92,
      };
    }

    // ── 8. Events ───────────────────────────────────────────────────────────
    if (
      /show.*events?|view.*events?|open.*events?|events?.*dikhao|events?.*dikhaiye|upcoming.*events?/.test(q) ||
      /इवेंट.*दिखाओ|आगामी.*इवेंट|इवेंट.*दिखाइए/.test(q) ||
      /events?.*காட்டு/.test(q) ||
      /events?.*చూపించు/.test(q) ||
      /events?.*ತೋರಿಸು/.test(q) ||
      /events?.*കാണിക്കൂ/.test(q)
    ) {
      return {
        type: 'action',
        category: 'view_events',
        action: { name: 'view_events', parameters: {}, screen: '/(tabs)/activity' },
        response: 'Showing upcoming events.',
        confidence: 0.90,
      };
    }

    // ── 9. Member search (simple — no city/profession) ──────────────────────
    if (/search.*member|find.*member|member.*dhundo/.test(q) && q.length < 30) {
      return {
        type: 'action',
        category: 'search_member',
        action: { name: 'search_member', parameters: {}, screen: '/(tabs)/discover' },
        response: 'Taking you to member search.',
        confidence: 0.80,
      };
    }

    // ── 10. Language switch ──────────────────────────────────────────────────
    const langSwitchMap: Record<string, { code: string; confirm: string }> = {
      'hindi|हिंदी':       { code: 'hi', confirm: 'ठीक है! अब मैं हिंदी में बोलूँगा।' },
      'tamil|தமிழ்':       { code: 'ta', confirm: 'சரி! இப்போது நான் தமிழில் பேசுவேன்.' },
      'telugu|తెలుగు':     { code: 'te', confirm: 'సరే! ఇప్పుడు నేను తెలుగులో మాట్లాడతాను.' },
      'kannada|ಕನ್ನಡ':     { code: 'kn', confirm: 'ಸರಿ! ಈಗ ನಾನು ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡುತ್ತೇನೆ.' },
      'malayalam|മലയാളം': { code: 'ml', confirm: 'ശരി! ഇനി ഞാൻ മലയാളത്തിൽ സംസാരിക്കും.' },
      'english':           { code: 'en', confirm: 'Sure! Switching back to English.' },
    };
    const switchPattern = /speak.*in|talk.*in|switch.*to|change.*to|in\s+\w+\s*(please|language|lang|mein|me)?/;
    if (switchPattern.test(q)) {
      for (const [keys, lang] of Object.entries(langSwitchMap)) {
        if (new RegExp(keys, 'i').test(query)) {
          return {
            type: 'action',
            category: 'switch_language',
            action: { name: 'switch_language', parameters: { languageCode: lang.code } },
            response: lang.confirm,
            confidence: 0.97,
          };
        }
      }
    }

    return null; // Needs backend GPT
  }

  /**
   * Safe fallback intent classification using keywords if backend fails
   */
  private fallbackIntentClassification(query: string): Intent {
    const localMatch = this.fastLocalClassification(query);
    if (localMatch) return localMatch;
    const lowerQuery = query.toLowerCase();

    // Check for action keywords
    if (lowerQuery.includes('find') || lowerQuery.includes('search')) {
      return {
        type: 'action',
        category: 'search_member',
        action: {
          name: 'search_member',
          parameters: {},
          screen: '/(tabs)/discover',
        },
        response: 'Let me help you find someone in the network.',
        confidence: 0.7,
      };
    }

    if (lowerQuery.includes('deal')) {
      if (lowerQuery.includes('post') || lowerQuery.includes('create')) {
        return {
          type: 'action',
          category: 'post_deal',
          action: {
            name: 'post_deal',
            parameters: {},
            screen: '/deals-form',
          },
          response: 'Opening the deals form for you.',
          confidence: 0.7,
        };
      }
      return {
        type: 'action',
        category: 'view_deals',
        action: {
          name: 'view_deals',
          parameters: {},
          screen: '/(tabs)/activity',
        },
        response: 'Showing available deals.',
        confidence: 0.7,
      };
    }

    // Default to knowledge query
    return {
      type: 'knowledge',
      category: 'general',
      response: 'Let me look that up for you.',
      confidence: 0.5,
    };
  }

  /**
   * Execute an action
   */
  async executeAction(intent: Intent, language: string = 'en'): Promise<any> {
    if (intent.type !== 'action' || !intent.action) {
      return null;
    }

    const actionConfig = this.actionMap.get(intent.action.name);
    if (!actionConfig) {
      console.error('❌ Unknown action:', intent.action.name);
      return null;
    }

    try {
      console.log('⚡ Executing action:', intent.action.name);
      return await actionConfig.handler.call(this, intent.action.parameters, language);
    } catch (error) {
      console.error('❌ Action execution failed:', error);
      throw error;
    }
  }

  /**
   * Action Handlers
   */

  private async searchMembers(params: any): Promise<any> {
    try {
      const data = await searchMembersService({
        profession: params.profession,
        location: params.location,
        keyword: params.keyword,
      });

      return {
        success: true,
        data,
        message: `Found ${data.length} members`,
      };
    } catch (error) {
      console.error('❌ Search members failed:', error);
      return { success: false, error };
    }
  }

  private async queryEvents(_params: any): Promise<any> {
    try {
      const events = await EventsService.getUpcomingEvents();

      if (events.length === 0) {
        return { success: true, spokenResponse: "There are no upcoming events scheduled right now." };
      }

      const preview = events
        .slice(0, 3)
        .map(e => `${e.title || 'an event'} on ${e.event_date}`)
        .join(', ');
      const more = events.length > 3 ? `, and ${events.length - 3} more` : '';

      return {
        success: true,
        spokenResponse: `You have ${events.length} upcoming event${events.length === 1 ? '' : 's'}: ${preview}${more}.`,
      };
    } catch (error) {
      console.error('❌ Query events failed:', error);
      return { success: false, spokenResponse: "Sorry, I couldn't fetch upcoming events right now." };
    }
  }

  private async networkingSuggestions(_params: any): Promise<any> {
    try {
      const suggestions = await getSuggestedConnections(5);

      if (suggestions.length === 0) {
        return {
          success: true,
          spokenResponse: "I couldn't find any new connections to suggest right now — you may already be linked with everyone nearby.",
        };
      }

      const preview = suggestions
        .slice(0, 3)
        .map(s => `${s.full_name}, ${s.business_category || 'a business professional'}`)
        .join('; ');

      return {
        success: true,
        data: suggestions,
        spokenResponse: `Here are some people you could connect with: ${preview}.`,
      };
    } catch (error) {
      console.error('❌ Networking suggestions failed:', error);
      return { success: false, spokenResponse: "Sorry, I couldn't fetch networking suggestions right now." };
    }
  }

  /**
   * Database Query Actions
   */
  private async queryHouseMembers(params: any): Promise<any> {
    try {
      // 1. First we need to get the current user's profile to find their house_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return {
          success: false,
          spokenResponse: "I cannot check house members. You are not logged in."
        };
      }

      const { data: profile, error: profileError } = await supabase
        .from('users_profile')
        .select('house_id, house_name')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        return {
          success: false,
          spokenResponse: "I couldn't find your profile information to look up your house."
        };
      }

      const houseId = profile.house_id;
      const houseName = profile.house_name || 'your house';

      if (!houseId) {
        return {
          success: false,
          spokenResponse: "You don't appear to be assigned to a house yet."
        };
      }

      // 2. Query the database for the exact count of members with this house_id
      const { count, error: countError } = await supabase
        .from('users_profile')
        .select('*', { count: 'exact', head: true })
        .eq('house_id', houseId);

      if (countError) {
        return {
          success: false,
          spokenResponse: "Sorry, I had trouble counting the members in your house."
        };
      }

      const memberCount = count || 0;

      return {
        success: true,
        // Override the spoken response with the dynamic data result
        spokenResponse: `There are ${memberCount} members currently registered in ${houseName}.`,
      };
    } catch (error) {
      console.error('❌ Query house members failed:', error);
      return { success: false, spokenResponse: "I encountered an error while safely checking the database." };
    }
  }

  private async postDeal(params: any): Promise<any> {
    // Navigation action - will be handled by UI
    return {
      success: true,
      navigation: true,
      screen: '/deals-form',
    };
  }

  private async viewDeals(params: any): Promise<any> {
    return {
      success: true,
      navigation: true,
      screen: '/(tabs)/activity',
    };
  }

  private async sendLink(params: any): Promise<any> {
    return {
      success: true,
      navigation: true,
      screen: '/links-form',
    };
  }

  private async createI2We(params: any): Promise<any> {
    return {
      success: true,
      navigation: true,
      screen: '/i2we-form',
    };
  }

  private async createVoiceNote(params: any): Promise<any> {
    return {
      success: true,
      navigation: true,
      screen: '/voice-notes',
    };
  }

  private async viewProfile(params: any): Promise<any> {
    return {
      success: true,
      navigation: true,
      screen: '/(tabs)/profile',
    };
  }

  private async viewChannels(params: any): Promise<any> {
    return {
      success: true,
      navigation: true,
      screen: '/channels',
    };
  }

  private async viewActivity(params: any): Promise<any> {
    return {
      success: true,
      navigation: true,
      screen: '/(tabs)/activity',
    };
  }

  /**
   * Get available actions
   */
  getAvailableActions(): Array<{ name: string; description: string }> {
    return Array.from(this.actionMap.entries()).map(([name, config]) => ({
      name,
      description: config.description,
    }));
  }

  // ── READ-ONLY Activity Stats Handlers ──────────────────────────────────

  /** Returns a localised spoken response for links stats */
  private buildLinksResponse(stats: Awaited<ReturnType<typeof ActivityQueryService.getLinkStats>>, lang: string): string {
    const { total: t, sent: s, received: r, open: o, closed: c } = stats;
    switch (lang) {
      case 'hi': return `आपके कुल ${t} लिंक हैं। ${s} आपने भेजे, ${r} आपको मिले। ${o} खुले हैं और ${c} बंद हैं।`;
      case 'ta': return `உங்களுக்கு மொத்தம் ${t} links உள்ளன. ${s} அனுப்பியவை, ${r} பெற்றவை. ${o} திறந்திருக்கின்றன, ${c} மூடப்பட்டுவிட்டன.`;
      case 'te': return `మీకు మొత్తం ${t} links ఉన్నాయి. ${s} మీరు పంపినవి, ${r} మీకు వచ్చినవి. ${o} తెరిచి ఉన్నాయి, ${c} మూసివేశారు.`;
      case 'kn': return `ನಿಮಗೆ ಒಟ್ಟು ${t} links ಇವೆ. ${s} ನೀವು ಕಳಿಸಿದ್ದು, ${r} ನೀವು ಸ್ವೀಕರಿಸಿದ್ದು. ${o} ತೆರೆದಿವೆ, ${c} ಮುಚ್ಚಲ್ಪಟ್ಟಿವೆ.`;
      case 'ml': return `നിങ്ങൾക്ക് ആകെ ${t} links ഉണ്ട്. ${s} അയച്ചത്, ${r} ലഭിച്ചത്. ${o} തുറന്നിരിക്കുന്നു, ${c} അടച്ചിരിക്കുന്നു.`;
      default:   return `You have ${t} link${t !== 1 ? 's' : ''} in total. ${s} sent by you and ${r} received. ${o} are still open and ${c} are closed.`;
    }
  }

  /** Returns a localised spoken response for deals stats */
  private buildDealsResponse(stats: Awaited<ReturnType<typeof ActivityQueryService.getDealStats>>, lang: string): string {
    const { total: t, open: o, in_progress: ip, completed: cp, closed: cl } = stats;
    switch (lang) {
      case 'hi': return `आपके कुल ${t} डील हैं। ${o} खुले, ${ip} प्रगति में, ${cp} पूरे और ${cl} बंद।`;
      case 'ta': return `உங்களுக்கு மொத்தம் ${t} deals உள்ளன. ${o} திறந்தவை, ${ip} நடந்துகொண்டிருக்கின்றன, ${cp} முடிந்தவை, ${cl} மூடப்பட்டவை.`;
      case 'te': return `మీకు మొత్తం ${t} deals ఉన్నాయి. ${o} తెరిచి, ${ip} మధ్యలో, ${cp} పూర్తి, ${cl} మూసివేశారు.`;
      case 'kn': return `ನಿಮಗೆ ಒಟ್ಟು ${t} deals ಇವೆ. ${o} ತೆರೆದ, ${ip} ಪ್ರಗತಿಯಲ್ಲಿ, ${cp} ಮುಗಿದ, ${cl} ಮುಚ್ಚಿದ.`;
      case 'ml': return `നിങ്ങൾക്ക് ആകെ ${t} deals ഉണ്ട്. ${o} തുറന്നത്, ${ip} നടക്കുന്നത്, ${cp} പൂർത്തിയായത്, ${cl} അടച്ചത്.`;
      default:   return `You have ${t} deal${t !== 1 ? 's' : ''} in total. ${o} open, ${ip} in progress, ${cp} completed, and ${cl} closed.`;
    }
  }

  /** Returns a localised spoken response for i2We stats */
  private buildI2weResponse(stats: Awaited<ReturnType<typeof ActivityQueryService.getI2weStats>>, lang: string): string {
    const { total: t, scheduled: sc, completed: cp, cancelled: ca } = stats;
    switch (lang) {
      case 'hi': return `आपकी कुल ${t} i2We मीटिंग हैं। ${sc} निर्धारित, ${cp} पूरी और ${ca} रद्द।`;
      case 'ta': return `உங்களுக்கு மொத்தம் ${t} i2We meetings உள்ளன. ${sc} திட்டமிட்டவை, ${cp} முடிந்தவை, ${ca} ரத்துசெய்யப்பட்டவை.`;
      case 'te': return `మీకు మొత్తం ${t} i2We meetings ఉన్నాయి. ${sc} నిర్ణయించబడ్డాయి, ${cp} పూర్తి, ${ca} రద్దు.`;
      case 'kn': return `ನಿಮಗೆ ಒಟ್ಟು ${t} i2We meetings ಇವೆ. ${sc} ನಿಗದಿಪಡಿಸಿದ, ${cp} ಮುಗಿದ, ${ca} ರದ್ದಾದ.`;
      case 'ml': return `നിങ്ങൾക്ക് ആകെ ${t} i2We meetings ഉണ്ട്. ${sc} നിശ്ചയിച്ചത്, ${cp} പൂർത്തിയായത്, ${ca} റദ്ദാക്കിയത്.`;
      default:   return `You have ${t} i2We meeting${t !== 1 ? 's' : ''} in total. ${sc} scheduled, ${cp} completed, and ${ca} cancelled.`;
    }
  }

  /** Returns a localised spoken response for full activity summary */
  private buildAllActivityResponse(links: any, deals: any, i2We: any, lang: string): string {
    switch (lang) {
      case 'hi': return `आपकी activity का सारांश: लिंक — कुल ${links.total} (${links.open} खुले)। डील — कुल ${deals.total} (${deals.open} खुले, ${deals.completed} पूरे)। i2We मीटिंग — कुल ${i2we.total} (${i2we.scheduled} आने वाले)।`;
      case 'ta': return `உங்கள் activity சுருக்கம்: Links — மொத்தம் ${links.total} (${links.open} திறந்த). Deals — மொத்தம் ${deals.total} (${deals.open} திறந்த, ${deals.completed} முடிந்த). i2We meetings — மொத்தம் ${i2we.total} (${i2we.scheduled} வரவிருக்கும்).`;
      case 'te': return `మీ activity సారాంశం: Links — మొత్తం ${links.total} (${links.open} తెరిచి). Deals — మొత్తం ${deals.total} (${deals.open} తెరిచి, ${deals.completed} పూర్తి). i2We meetings — మొత్తం ${i2we.total} (${i2we.scheduled} రాబోయేవి).`;
      case 'kn': return `ನಿಮ್ಮ activity ಸಾರಾಂಶ: Links — ಒಟ್ಟು ${links.total} (${links.open} ತೆರೆದ). Deals — ಒಟ್ಟು ${deals.total} (${deals.open} ತೆರೆದ, ${deals.completed} ಮುಗಿದ). i2We meetings — ಒಟ್ಟು ${i2we.total} (${i2we.scheduled} ಮುಂಬರುವ).`;
      case 'ml': return `നിങ്ങളുടെ activity സംഗ്രഹം: Links — ആകെ ${links.total} (${links.open} തുറന്നത്). Deals — ആകെ ${deals.total} (${deals.open} തുറന്നത്, ${deals.completed} പൂർത്തിയായത്). i2We meetings — ആകെ ${i2we.total} (${i2we.scheduled} വരുന്നവ).`;
      default:   return `Your activity summary: Links — ${links.total} total (${links.open} open). Deals — ${deals.total} total (${deals.open} open, ${deals.completed} completed). i2We meetings — ${i2we.total} total (${i2we.scheduled} upcoming).`;
    }
  }

  private async queryLinksStats(_params: any, language: string = 'en'): Promise<any> {
    try {
      const stats = await ActivityQueryService.getLinkStats();
      const spokenResponse = this.buildLinksResponse(stats, language);
      return { success: true, stats, spokenResponse };
    } catch (error) {
      return { success: false, spokenResponse: this.errorMsg('links', language) };
    }
  }

  private async queryDealsStats(_params: any, language: string = 'en'): Promise<any> {
    try {
      const stats = await ActivityQueryService.getDealStats();
      const spokenResponse = this.buildDealsResponse(stats, language);
      return { success: true, stats, spokenResponse };
    } catch (error) {
      return { success: false, spokenResponse: this.errorMsg('deals', language) };
    }
  }

  private async queryI2weStats(_params: any, language: string = 'en'): Promise<any> {
    try {
      const stats = await ActivityQueryService.getI2weStats();
      const spokenResponse = this.buildI2weResponse(stats, language);
      return { success: true, stats, spokenResponse };
    } catch (error) {
      return { success: false, spokenResponse: this.errorMsg('i2We', language) };
    }
  }

  private async queryAllActivityStats(_params: any, language: string = 'en'): Promise<any> {
    try {
      const { links, deals, i2We } = await ActivityQueryService.getAllStats();
      const spokenResponse = this.buildAllActivityResponse(links, deals, i2We, language);
      return { success: true, stats: { links, deals, i2We }, spokenResponse };
    } catch (error) {
      return { success: false, spokenResponse: this.errorMsg('activity', language) };
    }
  }

  /** Localised error messages for failed DB queries */
  private errorMsg(subject: string, lang: string): string {
    switch (lang) {
      case 'hi': return `क्षमा करें, अभी ${subject} की जानकारी नहीं मिल सकी। कृपया फिर कोशिश करें।`;
      case 'ta': return `மன்னிக்கவும், இப்போது ${subject} விவரங்களை பெற முடியவில்லை.`;
      case 'te': return `క్షమించండి, ఇప్పుడు ${subject} వివరాలు పొందలేకపోయాం.`;
      case 'kn': return `ಕ್ಷಮಿಸಿ, ಇದೀಗ ${subject} ವಿವರಗಳನ್ನು ಪಡೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.`;
      case 'ml': return `ക്ഷമിക്കണം, ഇപ്പോൾ ${subject} വിവരങ്ങൾ ലഭിക്കുന്നില്ല.`;
      default:   return `Sorry, I couldn't fetch your ${subject} details right now.`;
    }
  }
}

export const actionEngine = new ActionEngine();
