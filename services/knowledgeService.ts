import { supabase } from '@/lib/supabase';
import { getEmbeddingsEndpoint, fetchWithErrorHandling } from '@/lib/apiConfig';

export interface KnowledgeDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    title: string;
    category: string;
    source: string;
  };
}

/**
 * 🧠 Knowledge Brain with RAG (Retrieval Augmented Generation)
 * 
 * Prevents hallucination by grounding responses in actual knowledge base
 */
class KnowledgeService {
  private knowledgeCache: Map<string, KnowledgeDocument[]> = new Map();
  // Tracks which named document sets have been loaded this session, so
  // independent seed scripts (app FAQ, business advisor, etc.) can each
  // load once without stepping on each other.
  private _loadedKnowledgeSets = new Set<string>();
  // Sources that are personal to the current user and must be scoped by user_id
  // rather than stored as shared/global knowledge (user_id IS NULL).
  private readonly PERSONAL_SOURCES = new Set(['user_activity', 'session_memory']);

  /**
   * Resolve the owning user_id for a document based on its source.
   * Returns null for shared/global sources (core_knowledge, custom, etc).
   */
  private async resolveUserId(source: string): Promise<string | null> {
    if (!this.PERSONAL_SOURCES.has(source)) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  }

  /**
   * Initialize knowledge base in Supabase
   * Creates necessary tables and functions
   */
  async initializeKnowledgeBase(): Promise<void> {
    try {
      // Create knowledge_base table if it doesn't exist
      const { error } = await supabase.rpc('create_knowledge_base_table');
      
      if (error && !error.message.includes('already exists')) {
        console.error('❌ Failed to initialize knowledge base:', error);
      } else {
        console.log('✅ Knowledge base initialized');
      }
    } catch (error) {
      console.error('❌ Knowledge base initialization error:', error);
    }
  }

  /**
   * Add document to knowledge base with embeddings
   */
  async addDocument(document: Omit<KnowledgeDocument, 'id' | 'embedding'>): Promise<void> {
    try {
      // Generate embedding for the document
      const embedding = await this.generateEmbedding(document.content);
      const userId = await this.resolveUserId(document.metadata.source);

      // Store in Supabase
      const { error } = await supabase
        .from('knowledge_base')
        .insert({
          content: document.content,
          embedding: embedding,
          metadata: document.metadata,
          user_id: userId,
        });

      if (error) {
        console.error('❌ Failed to add document:', error);
        throw error;
      }

      console.log('✅ Document added:', document.metadata.title);
      
      // Clear cache
      this.knowledgeCache.clear();
    } catch (error) {
      console.error('❌ Error adding document:', error);
      throw error;
    }
  }

  /**
   * Upsert document (insert or update if exists)
   * Prevents duplicate entries by checking title and category.
   * Documents with source 'user_activity' are always refreshed (updated) when they exist.
   * @returns true if inserted/updated, false if skipped
   */
  async upsertDocument(document: Omit<KnowledgeDocument, 'id' | 'embedding'>): Promise<boolean> {
    try {
      const userId = await this.resolveUserId(document.metadata.source);

      // Check if document already exists by title + category, scoped to the
      // owning user for personal docs so different users' rows never collide.
      let existingQuery = supabase
        .from('knowledge_base')
        .select('id')
        .eq('metadata->>title', document.metadata.title)
        .eq('metadata->>category', document.metadata.category);
      existingQuery = userId ? existingQuery.eq('user_id', userId) : existingQuery.is('user_id', null);
      const { data: existing } = await existingQuery.limit(1);

      if (existing && existing.length > 0) {
        // User-activity docs should always be refreshed so the AI stays up-to-date
        if (document.metadata.source === 'user_activity') {
          await this.updateDocument(document);
          return true;
        }
        console.log('⏭️ Document already exists (skipping):', document.metadata.title);
        return false;
      }

      // Otherwise, add the document
      await this.addDocument(document);
      return true;
    } catch (error) {
      console.error('❌ Error upserting document:', error);
      throw error;
    }
  }

  /**
   * Update an existing knowledge document (replace content + re-embed).
   * Used for user_activity documents that change over time.
   */
  async updateDocument(document: Omit<KnowledgeDocument, 'id' | 'embedding'>): Promise<void> {
    try {
      const embedding = await this.generateEmbedding(document.content);
      const userId = await this.resolveUserId(document.metadata.source);

      let updateQuery = supabase
        .from('knowledge_base')
        .update({
          content: document.content,
          embedding,
          metadata: document.metadata,
          user_id: userId,
        })
        .eq('metadata->>title', document.metadata.title)
        .eq('metadata->>category', document.metadata.category);
      updateQuery = userId ? updateQuery.eq('user_id', userId) : updateQuery.is('user_id', null);

      const { error } = await updateQuery;

      if (error) {
        console.error('❌ Failed to update document:', error);
        throw error;
      }

      console.log('🔄 Document updated:', document.metadata.title);
      this.knowledgeCache.clear();
    } catch (error) {
      console.error('❌ Error updating document:', error);
      throw error;
    }
  }

  /**
   * Fetch a personal document's content for the current user, bypassing keyword/embedding
   * matching. Used for lightweight cross-session memory that must load deterministically
   * (e.g. at the start of a new session) rather than depend on the query matching it.
   */
  async getPersonalDocument(title: string, category: string): Promise<string | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data } = await supabase
        .from('knowledge_base')
        .select('content')
        .eq('metadata->>title', title)
        .eq('metadata->>category', category)
        .eq('user_id', user.id)
        .limit(1);

      return data && data.length > 0 ? data[0].content : null;
    } catch (error) {
      console.error('❌ Error fetching personal document:', error);
      return null;
    }
  }

  /**
   * Search knowledge base using semantic search
   * This is the core RAG retrieval function
   */
  async searchKnowledge(query: string, limit: number = 5): Promise<string> {
    try {
      console.log('🔍 Searching knowledge base for:', query);

      // Try keyword search first (works without embeddings)
      const keywordResult = await this.keywordSearch(query, limit);
      
      if (keywordResult && keywordResult !== 'No relevant information found in knowledge base.') {
        return keywordResult;
      }

      // If keyword search fails, try embedding-based search
      try {
        const queryEmbedding = await this.generateEmbedding(query);
        
        if (queryEmbedding) {
          const { data, error } = await supabase.rpc('search_knowledge', {
            query_embedding: queryEmbedding,
            match_limit: limit,
          });

          if (!error && data && data.length > 0) {
            const context = data
              .map((doc: any) => `${doc.metadata.title}:\n${doc.content}`)
              .join('\n\n---\n\n');
            
            console.log('✅ Found', data.length, 'relevant documents (embedding search)');
            return context;
          }
        }
      } catch (embeddingError) {
        console.log('⚠️ Embedding search not available, using keyword search');
      }

      // Return keyword result or empty string
      return keywordResult;
    } catch (error) {
      console.error('❌ Search failed:', error);
      return 'WeVysya is a business network. I can help you find members, post deals, and more.';
    }
  }

  /**
   * Fallback keyword search
   */
  private async keywordSearch(query: string, limit: number): Promise<string> {
    try {
      console.log('🔎 Performing keyword search for:', query);
      
      // Try simple text search using ilike (case-insensitive LIKE)
      const searchTerm = `%${query.toLowerCase()}%`;
      
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('content, metadata')
        .or(`content.ilike.${searchTerm},metadata->>title.ilike.${searchTerm}`)
        .limit(limit);

      if (error) {
        console.error('❌ Keyword search error:', error);
        // Return all documents as fallback
        const { data: allDocs } = await supabase
          .from('knowledge_base')
          .select('content, metadata')
          .limit(limit);
        
        if (allDocs && allDocs.length > 0) {
          console.log('✅ Returning all documents as fallback');
          return allDocs
            .map((doc: any) => `${doc.metadata.title}:\n${doc.content}`)
            .join('\n\n---\n\n');
        }
        
        return 'No relevant information found.';
      }

      if (!data || data.length === 0) {
        console.log('⚠️ No keyword matches, returning all documents');
        // Return all documents if no matches
        const { data: allDocs } = await supabase
          .from('knowledge_base')
          .select('content, metadata')
          .limit(limit);
        
        if (allDocs && allDocs.length > 0) {
          return allDocs
            .map((doc: any) => `${doc.metadata.title}:\n${doc.content}`)
            .join('\n\n---\n\n');
        }
        
        return 'No relevant information found.';
      }

      console.log('✅ Found', data.length, 'documents via keyword search');
      return data
        .map((doc: any) => `${doc.metadata.title}:\n${doc.content}`)
        .join('\n\n---\n\n');
    } catch (error) {
      console.error('❌ Keyword search failed:', error);
      return 'WeVysya is a business community network.';
    }
  }

  /**
   * Generate embedding using backend proxy endpoint
   * The actual OpenAI API call is made server-side for security
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Call backend proxy endpoint via Supabase Edge Function
      const endpoint = getEmbeddingsEndpoint();
      
      const data = await fetchWithErrorHandling<{ embedding: number[] }>(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
        }
      );

      return data.embedding;
    } catch (error) {
      console.error('❌ Embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Batch load knowledge documents.
   * Skips entirely if already loaded this session.
   * Runs all upserts in parallel to avoid ANR from sequential network calls.
   */
  async loadKnowledgeBase(
    documents: Array<Omit<KnowledgeDocument, 'id' | 'embedding'>>,
    setId: string = 'default'
  ): Promise<void> {
    if (this._loadedKnowledgeSets.has(setId)) {
      console.log(`⏭️ Knowledge set '${setId}' already loaded this session, skipping.`);
      return;
    }

    console.log(`📚 Loading ${documents.length} documents in parallel...`);

    const results = await Promise.allSettled(
      documents.map(doc => this.upsertDocument(doc))
    );

    const loaded = results.filter(r => r.status === 'fulfilled' && r.value).length;
    const skipped = results.filter(r => r.status === 'fulfilled' && !r.value).length;
    const failed = results.filter(r => r.status === 'rejected').length;

    this._loadedKnowledgeSets.add(setId);
    console.log(`✅ Knowledge set '${setId}' loaded: ${loaded} added, ${skipped} skipped, ${failed} failed`);
  }

  /**
   * Get document by category
   */
  async getDocumentsByCategory(category: string): Promise<KnowledgeDocument[]> {
    try {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .eq('metadata->>category', category);

      if (error) {
        console.error('❌ Failed to get documents:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('❌ Error getting documents:', error);
      return [];
    }
  }

  /**
   * Clear knowledge base
   */
  async clearKnowledgeBase(): Promise<void> {
    try {
      const { error } = await supabase
        .from('knowledge_base')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) {
        console.error('❌ Failed to clear knowledge base:', error);
      } else {
        console.log('✅ Knowledge base cleared');
        this.knowledgeCache.clear();
      }
    } catch (error) {
      console.error('❌ Error clearing knowledge base:', error);
    }
  }
}

export const knowledgeService = new KnowledgeService();
