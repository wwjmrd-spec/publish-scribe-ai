export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_draft_replies: {
        Row: {
          approved_at: string | null
          body: string | null
          category: string | null
          confidence: number | null
          confidence_label: string | null
          created_at: string
          edited_by: string | null
          email_id: string
          id: string
          language: string | null
          model: string | null
          reasoning: string | null
          sources: Json
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          body?: string | null
          category?: string | null
          confidence?: number | null
          confidence_label?: string | null
          created_at?: string
          edited_by?: string | null
          email_id: string
          id?: string
          language?: string | null
          model?: string | null
          reasoning?: string | null
          sources?: Json
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          body?: string | null
          category?: string | null
          confidence?: number | null
          confidence_label?: string | null
          created_at?: string
          edited_by?: string | null
          email_id?: string
          id?: string
          language?: string | null
          model?: string | null
          reasoning?: string | null
          sources?: Json
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_draft_replies_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "ai_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_email_logs: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          detail: Json | null
          draft_id: string | null
          email_id: string | null
          id: string
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          detail?: Json | null
          draft_id?: string | null
          email_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          detail?: Json | null
          draft_id?: string | null
          email_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_email_logs_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "ai_draft_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_email_logs_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "ai_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_email_settings: {
        Row: {
          ai_enabled: boolean
          ai_instructions: string | null
          created_at: string
          default_language: string
          id: string
          last_poll_at: string | null
          last_poll_status: string | null
          polling_interval_minutes: number
          reply_tone: string
          signature: string | null
          updated_at: string
          zoho_account_id: string | null
          zoho_client_id: string | null
          zoho_client_secret: string | null
          zoho_refresh_token: string | null
          zoho_region: string
        }
        Insert: {
          ai_enabled?: boolean
          ai_instructions?: string | null
          created_at?: string
          default_language?: string
          id?: string
          last_poll_at?: string | null
          last_poll_status?: string | null
          polling_interval_minutes?: number
          reply_tone?: string
          signature?: string | null
          updated_at?: string
          zoho_account_id?: string | null
          zoho_client_id?: string | null
          zoho_client_secret?: string | null
          zoho_refresh_token?: string | null
          zoho_region?: string
        }
        Update: {
          ai_enabled?: boolean
          ai_instructions?: string | null
          created_at?: string
          default_language?: string
          id?: string
          last_poll_at?: string | null
          last_poll_status?: string | null
          polling_interval_minutes?: number
          reply_tone?: string
          signature?: string | null
          updated_at?: string
          zoho_account_id?: string | null
          zoho_client_id?: string | null
          zoho_client_secret?: string | null
          zoho_refresh_token?: string | null
          zoho_region?: string
        }
        Relationships: []
      }
      ai_emails: {
        Row: {
          attachments: Json
          body_html: string | null
          body_text: string | null
          created_at: string
          folder: string
          from_email: string | null
          from_name: string | null
          has_attachments: boolean
          id: string
          is_read: boolean
          raw: Json | null
          received_at: string | null
          snippet: string | null
          status: string
          subject: string | null
          to_email: string | null
          updated_at: string
          zoho_message_id: string
          zoho_thread_id: string | null
        }
        Insert: {
          attachments?: Json
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          folder?: string
          from_email?: string | null
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          is_read?: boolean
          raw?: Json | null
          received_at?: string | null
          snippet?: string | null
          status?: string
          subject?: string | null
          to_email?: string | null
          updated_at?: string
          zoho_message_id: string
          zoho_thread_id?: string | null
        }
        Update: {
          attachments?: Json
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          folder?: string
          from_email?: string | null
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          is_read?: boolean
          raw?: Json | null
          received_at?: string | null
          snippet?: string | null
          status?: string
          subject?: string | null
          to_email?: string | null
          updated_at?: string
          zoho_message_id?: string
          zoho_thread_id?: string | null
        }
        Relationships: []
      }
      ai_faq: {
        Row: {
          answer: string
          category: string | null
          created_at: string
          created_by: string | null
          embedding: string | null
          id: string
          is_active: boolean
          keywords: string[]
          language: string
          priority: number
          question: string
          status: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          language?: string
          priority?: number
          question: string
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          language?: string
          priority?: number
          question?: string
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      ai_knowledge_base: {
        Row: {
          category: string | null
          content: string
          created_at: string
          created_by: string | null
          embedding: string | null
          id: string
          is_active: boolean
          keywords: string[]
          language: string
          priority: number
          question: string | null
          status: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          language?: string
          priority?: number
          question?: string | null
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          language?: string
          priority?: number
          question?: string | null
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_writer_usage: {
        Row: {
          action: string
          article_title: string | null
          created_at: string
          id: string
          metadata: Json
          user_email: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          article_title?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          user_email?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          article_title?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          user_email?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      article_reviews: {
        Row: {
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          article_id: string
          content_score: number | null
          detailed_feedback: Json | null
          grammar_score: number | null
          id: string
          overall_score: number | null
          plagiarism_score: number | null
          report_url: string | null
          review_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          scores_edited: boolean
          summary: string | null
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          article_id: string
          content_score?: number | null
          detailed_feedback?: Json | null
          grammar_score?: number | null
          id?: string
          overall_score?: number | null
          plagiarism_score?: number | null
          report_url?: string | null
          review_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scores_edited?: boolean
          summary?: string | null
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          article_id?: string
          content_score?: number | null
          detailed_feedback?: Json | null
          grammar_score?: number | null
          id?: string
          overall_score?: number | null
          plagiarism_score?: number | null
          report_url?: string | null
          review_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scores_edited?: boolean
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_reviews_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_reviews_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "published_articles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          abstract: string | null
          ai_autocorrected: boolean
          ai_autocorrected_at: string | null
          allow_author_edit: boolean
          allow_withdrawal: boolean
          author_details_changed_once: boolean
          author_edits_remaining: number
          author_id: string
          author_name: string | null
          author_revision_html: string | null
          author_revision_submitted_at: string | null
          author_update_html: string | null
          author_update_notes: string | null
          author_update_status: string
          author_update_submitted_at: string | null
          automation_paused: boolean
          certificate_url: string | null
          copyright_form_url: string | null
          country: string | null
          created_at: string | null
          created_via: string
          discovery_details: Json | null
          discovery_source: string | null
          display_order: number | null
          document_url: string | null
          edit_lock_reason: string | null
          edit_lock_updated_at: string | null
          edit_lock_updated_by: string | null
          fee_promise_date: string | null
          fee_promise_status: string
          fee_reminder_email_sent_at: string | null
          formatted_content: string | null
          formatted_document_url: string | null
          formatted_docx_url: string | null
          formatting_approved_at: string | null
          formatting_status: string | null
          formatting_suggestions: Json | null
          free_review_report_downloaded: boolean
          galley_proof_consent: boolean | null
          galley_proof_deadline: string | null
          galley_proof_pdf_url: string | null
          galley_proof_revision_url: string | null
          galley_proof_sent_at: string | null
          galley_proof_status: string | null
          galley_proof_word_url: string | null
          id: string
          in_publish_queue: boolean
          issue: string | null
          keywords: string[] | null
          low_score_email_sent_at: string | null
          manuscript_accepted_email_sent_at: string | null
          missing_section_samples: Json | null
          missing_sections: string[] | null
          page_count: number | null
          page_number: string | null
          publication_type: string
          publication_year: string | null
          publish_queue_added_at: string | null
          published_link: string | null
          published_tier: string | null
          published_to_wwjmrd_at: string | null
          reason_of_research: string | null
          reference_number: string
          review_report_download_count: number
          review_report_paid: boolean
          review_report_paid_at: string | null
          review_report_url: string | null
          status: Database["public"]["Enums"]["article_status"] | null
          subject: string | null
          submission_date: string | null
          submission_target: string | null
          title: string
          updated_at: string | null
          volume: string | null
          wwjmrd_article_id: number | null
        }
        Insert: {
          abstract?: string | null
          ai_autocorrected?: boolean
          ai_autocorrected_at?: string | null
          allow_author_edit?: boolean
          allow_withdrawal?: boolean
          author_details_changed_once?: boolean
          author_edits_remaining?: number
          author_id: string
          author_name?: string | null
          author_revision_html?: string | null
          author_revision_submitted_at?: string | null
          author_update_html?: string | null
          author_update_notes?: string | null
          author_update_status?: string
          author_update_submitted_at?: string | null
          automation_paused?: boolean
          certificate_url?: string | null
          copyright_form_url?: string | null
          country?: string | null
          created_at?: string | null
          created_via?: string
          discovery_details?: Json | null
          discovery_source?: string | null
          display_order?: number | null
          document_url?: string | null
          edit_lock_reason?: string | null
          edit_lock_updated_at?: string | null
          edit_lock_updated_by?: string | null
          fee_promise_date?: string | null
          fee_promise_status?: string
          fee_reminder_email_sent_at?: string | null
          formatted_content?: string | null
          formatted_document_url?: string | null
          formatted_docx_url?: string | null
          formatting_approved_at?: string | null
          formatting_status?: string | null
          formatting_suggestions?: Json | null
          free_review_report_downloaded?: boolean
          galley_proof_consent?: boolean | null
          galley_proof_deadline?: string | null
          galley_proof_pdf_url?: string | null
          galley_proof_revision_url?: string | null
          galley_proof_sent_at?: string | null
          galley_proof_status?: string | null
          galley_proof_word_url?: string | null
          id?: string
          in_publish_queue?: boolean
          issue?: string | null
          keywords?: string[] | null
          low_score_email_sent_at?: string | null
          manuscript_accepted_email_sent_at?: string | null
          missing_section_samples?: Json | null
          missing_sections?: string[] | null
          page_count?: number | null
          page_number?: string | null
          publication_type?: string
          publication_year?: string | null
          publish_queue_added_at?: string | null
          published_link?: string | null
          published_tier?: string | null
          published_to_wwjmrd_at?: string | null
          reason_of_research?: string | null
          reference_number: string
          review_report_download_count?: number
          review_report_paid?: boolean
          review_report_paid_at?: string | null
          review_report_url?: string | null
          status?: Database["public"]["Enums"]["article_status"] | null
          subject?: string | null
          submission_date?: string | null
          submission_target?: string | null
          title: string
          updated_at?: string | null
          volume?: string | null
          wwjmrd_article_id?: number | null
        }
        Update: {
          abstract?: string | null
          ai_autocorrected?: boolean
          ai_autocorrected_at?: string | null
          allow_author_edit?: boolean
          allow_withdrawal?: boolean
          author_details_changed_once?: boolean
          author_edits_remaining?: number
          author_id?: string
          author_name?: string | null
          author_revision_html?: string | null
          author_revision_submitted_at?: string | null
          author_update_html?: string | null
          author_update_notes?: string | null
          author_update_status?: string
          author_update_submitted_at?: string | null
          automation_paused?: boolean
          certificate_url?: string | null
          copyright_form_url?: string | null
          country?: string | null
          created_at?: string | null
          created_via?: string
          discovery_details?: Json | null
          discovery_source?: string | null
          display_order?: number | null
          document_url?: string | null
          edit_lock_reason?: string | null
          edit_lock_updated_at?: string | null
          edit_lock_updated_by?: string | null
          fee_promise_date?: string | null
          fee_promise_status?: string
          fee_reminder_email_sent_at?: string | null
          formatted_content?: string | null
          formatted_document_url?: string | null
          formatted_docx_url?: string | null
          formatting_approved_at?: string | null
          formatting_status?: string | null
          formatting_suggestions?: Json | null
          free_review_report_downloaded?: boolean
          galley_proof_consent?: boolean | null
          galley_proof_deadline?: string | null
          galley_proof_pdf_url?: string | null
          galley_proof_revision_url?: string | null
          galley_proof_sent_at?: string | null
          galley_proof_status?: string | null
          galley_proof_word_url?: string | null
          id?: string
          in_publish_queue?: boolean
          issue?: string | null
          keywords?: string[] | null
          low_score_email_sent_at?: string | null
          manuscript_accepted_email_sent_at?: string | null
          missing_section_samples?: Json | null
          missing_sections?: string[] | null
          page_count?: number | null
          page_number?: string | null
          publication_type?: string
          publication_year?: string | null
          publish_queue_added_at?: string | null
          published_link?: string | null
          published_tier?: string | null
          published_to_wwjmrd_at?: string | null
          reason_of_research?: string | null
          reference_number?: string
          review_report_download_count?: number
          review_report_paid?: boolean
          review_report_paid_at?: string | null
          review_report_url?: string | null
          status?: Database["public"]["Enums"]["article_status"] | null
          subject?: string | null
          submission_date?: string | null
          submission_target?: string | null
          title?: string
          updated_at?: string | null
          volume?: string | null
          wwjmrd_article_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          ai_response: string | null
          created_at: string
          description: string | null
          error_stack: string | null
          id: string
          page_url: string | null
          resolved_at: string | null
          status: string
          title: string
          type: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          ai_response?: string | null
          created_at?: string
          description?: string | null
          error_stack?: string | null
          id?: string
          page_url?: string | null
          resolved_at?: string | null
          status?: string
          title: string
          type?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          ai_response?: string | null
          created_at?: string
          description?: string | null
          error_stack?: string | null
          id?: string
          page_url?: string | null
          resolved_at?: string | null
          status?: string
          title?: string
          type?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_ai_logs: {
        Row: {
          confidence: number | null
          conversation_id: string | null
          created_at: string
          escalated: boolean
          escalation_reason: string | null
          id: string
          latency_ms: number | null
          message_id: string | null
          model: string | null
          question: string | null
          retrieved_ids: Json
          top_score: number | null
        }
        Insert: {
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          escalated?: boolean
          escalation_reason?: string | null
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          model?: string | null
          question?: string | null
          retrieved_ids?: Json
          top_score?: number | null
        }
        Update: {
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          escalated?: boolean
          escalation_reason?: string | null
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          model?: string | null
          question?: string | null
          retrieved_ids?: Json
          top_score?: number | null
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          article_title: string | null
          assigned_admin: string | null
          author_email: string | null
          author_name: string | null
          channel: string
          country: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_for: string
          human_takeover: boolean
          id: string
          language: string
          reference_number: string | null
          satisfaction: number | null
          session_id: string
          site: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          article_title?: string | null
          assigned_admin?: string | null
          author_email?: string | null
          author_name?: string | null
          channel?: string
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_for?: string
          human_takeover?: boolean
          id?: string
          language?: string
          reference_number?: string | null
          satisfaction?: number | null
          session_id: string
          site?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          article_title?: string | null
          assigned_admin?: string | null
          author_email?: string | null
          author_name?: string | null
          channel?: string
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_for?: string
          human_takeover?: boolean
          id?: string
          language?: string
          reference_number?: string | null
          satisfaction?: number | null
          session_id?: string
          site?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          confidence: number | null
          content: string
          conversation_id: string
          created_at: string
          escalated: boolean
          feedback: number | null
          id: string
          role: string
          sources: Json
        }
        Insert: {
          confidence?: number | null
          content: string
          conversation_id: string
          created_at?: string
          escalated?: boolean
          feedback?: number | null
          id?: string
          role: string
          sources?: Json
        }
        Update: {
          confidence?: number | null
          content?: string
          conversation_id?: string
          created_at?: string
          escalated?: boolean
          feedback?: number | null
          id?: string
          role?: string
          sources?: Json
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_sites: {
        Row: {
          allowed_origins: string[]
          created_at: string
          id: string
          is_active: boolean
          language: string
          logo_url: string | null
          name: string
          primary_color: string
          public_key: string
          slug: string
          theme: string
          updated_at: string
          welcome_message: string
        }
        Insert: {
          allowed_origins?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          language?: string
          logo_url?: string | null
          name: string
          primary_color?: string
          public_key: string
          slug: string
          theme?: string
          updated_at?: string
          welcome_message?: string
        }
        Update: {
          allowed_origins?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          language?: string
          logo_url?: string | null
          name?: string
          primary_color?: string
          public_key?: string
          slug?: string
          theme?: string
          updated_at?: string
          welcome_message?: string
        }
        Relationships: []
      }
      co_author_certificates: {
        Row: {
          amount_paid: number | null
          article_id: string
          certificate_url: string | null
          co_author_id: string
          created_at: string | null
          currency: Database["public"]["Enums"]["currency_type"] | null
          id: string
          payment_id: string | null
          payment_status:
            | Database["public"]["Enums"]["coauthor_payment_status"]
            | null
        }
        Insert: {
          amount_paid?: number | null
          article_id: string
          certificate_url?: string | null
          co_author_id: string
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"] | null
          id?: string
          payment_id?: string | null
          payment_status?:
            | Database["public"]["Enums"]["coauthor_payment_status"]
            | null
        }
        Update: {
          amount_paid?: number | null
          article_id?: string
          certificate_url?: string | null
          co_author_id?: string
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"] | null
          id?: string
          payment_id?: string | null
          payment_status?:
            | Database["public"]["Enums"]["coauthor_payment_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "co_author_certificates_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_author_certificates_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "published_articles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_author_certificates_co_author_id_fkey"
            columns: ["co_author_id"]
            isOneToOne: false
            referencedRelation: "co_authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_author_certificates_co_author_id_fkey"
            columns: ["co_author_id"]
            isOneToOne: false
            referencedRelation: "co_authors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      co_authors: {
        Row: {
          affiliation: string | null
          article_id: string
          created_at: string | null
          email: string
          id: string
          name: string
        }
        Insert: {
          affiliation?: string | null
          article_id: string
          created_at?: string | null
          email: string
          id?: string
          name: string
        }
        Update: {
          affiliation?: string | null
          article_id?: string
          created_at?: string | null
          email?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "co_authors_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_authors_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "published_articles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_questions: {
        Row: {
          admin_notes: string | null
          created_at: string
          email: string
          id: string
          ip_address: string | null
          message: string
          name: string
          phone: string | null
          status: string
          subject: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          message: string
          name: string
          phone?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          message?: string
          name?: string
          phone?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      discount_codes: {
        Row: {
          applies_to: string
          article_position_limit: string
          auto_apply: boolean
          code: string
          created_at: string | null
          created_by: string | null
          currency: Database["public"]["Enums"]["discount_currency"]
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          end_date: string
          id: string
          is_active: boolean | null
          is_default: boolean
          max_uses_per_user: number | null
          show_in_cart: boolean
          specific_article_ids: string[] | null
          start_date: string
          usage_limit: number | null
          used_count: number | null
        }
        Insert: {
          applies_to?: string
          article_position_limit?: string
          auto_apply?: boolean
          code: string
          created_at?: string | null
          created_by?: string | null
          currency: Database["public"]["Enums"]["discount_currency"]
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          end_date: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean
          max_uses_per_user?: number | null
          show_in_cart?: boolean
          specific_article_ids?: string[] | null
          start_date: string
          usage_limit?: number | null
          used_count?: number | null
        }
        Update: {
          applies_to?: string
          article_position_limit?: string
          auto_apply?: boolean
          code?: string
          created_at?: string | null
          created_by?: string | null
          currency?: Database["public"]["Enums"]["discount_currency"]
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          end_date?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean
          max_uses_per_user?: number | null
          show_in_cart?: boolean
          specific_article_ids?: string[] | null
          start_date?: string
          usage_limit?: number | null
          used_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_redemptions: {
        Row: {
          discount_code_id: string
          id: string
          payment_id: string | null
          redeemed_at: string
          user_id: string
        }
        Insert: {
          discount_code_id: string
          id?: string
          payment_id?: string | null
          redeemed_at?: string
          user_id: string
        }
        Update: {
          discount_code_id?: string
          id?: string
          payment_id?: string | null
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_redemptions_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          created_at: string
          email_type: string
          error_message: string | null
          id: string
          metadata: Json | null
          recipient_email: string
          recipient_name: string | null
          related_article_id: string | null
          related_user_id: string | null
          sent_at: string
          status: string
          subject: string
          template_name: string | null
        }
        Insert: {
          created_at?: string
          email_type?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email: string
          recipient_name?: string | null
          related_article_id?: string | null
          related_user_id?: string | null
          sent_at?: string
          status?: string
          subject: string
          template_name?: string | null
        }
        Update: {
          created_at?: string
          email_type?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email?: string
          recipient_name?: string | null
          related_article_id?: string | null
          related_user_id?: string | null
          sent_at?: string
          status?: string
          subject?: string
          template_name?: string | null
        }
        Relationships: []
      }
      email_preference_audit: {
        Row: {
          action: string
          actor_id: string | null
          author_id: string
          category: string
          created_at: string
          email: string | null
          id: string
          ip_address: string | null
          source: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          author_id: string
          category: string
          created_at?: string
          email?: string | null
          id?: string
          ip_address?: string | null
          source?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          author_id?: string
          category?: string
          created_at?: string
          email?: string | null
          id?: string
          ip_address?: string | null
          source?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      email_preferences: {
        Row: {
          announcements_enabled: boolean
          author_id: string
          created_at: string
          email: string
          fee_reminder_enabled: boolean
          id: string
          marketing_enabled: boolean
          revision_requested_enabled: boolean
          updated_at: string
        }
        Insert: {
          announcements_enabled?: boolean
          author_id: string
          created_at?: string
          email: string
          fee_reminder_enabled?: boolean
          id?: string
          marketing_enabled?: boolean
          revision_requested_enabled?: boolean
          updated_at?: string
        }
        Update: {
          announcements_enabled?: boolean
          author_id?: string
          created_at?: string
          email?: string
          fee_reminder_enabled?: boolean
          id?: string
          marketing_enabled?: boolean
          revision_requested_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          html: string
          subject: string
          template_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          html: string
          subject: string
          template_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          html?: string
          subject?: string
          template_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          author_id: string
          category: string
          created_at: string
          id: string
          token: string
        }
        Insert: {
          author_id: string
          category: string
          created_at?: string
          id?: string
          token: string
        }
        Update: {
          author_id?: string
          category?: string
          created_at?: string
          id?: string
          token?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_activity: {
        Row: {
          amount: number | null
          article_id: string | null
          article_reference: string | null
          article_title: string | null
          created_at: string
          currency: string | null
          event_type: string
          id: string
          metadata: Json | null
          payment_gateway: string | null
          product_type: string | null
          user_email: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          amount?: number | null
          article_id?: string | null
          article_reference?: string | null
          article_title?: string | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          payment_gateway?: string | null
          product_type?: string | null
          user_email?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          amount?: number | null
          article_id?: string | null
          article_reference?: string | null
          article_title?: string | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          payment_gateway?: string | null
          product_type?: string | null
          user_email?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_activity_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_activity_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "published_articles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reminders: {
        Row: {
          article_id: string
          id: string
          reminder_type: string
          sent_at: string
          urgency_level: number | null
        }
        Insert: {
          article_id: string
          id?: string
          reminder_type?: string
          sent_at?: string
          urgency_level?: number | null
        }
        Update: {
          article_id?: string
          id?: string
          reminder_type?: string
          sent_at?: string
          urgency_level?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "published_articles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          article_ids: string[]
          created_at: string | null
          currency: Database["public"]["Enums"]["currency_type"]
          discount_amount: number | null
          discount_code: string | null
          final_amount: number
          id: string
          payment_gateway: Database["public"]["Enums"]["payment_gateway"]
          payment_items: Json | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          transaction_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          article_ids: string[]
          created_at?: string | null
          currency: Database["public"]["Enums"]["currency_type"]
          discount_amount?: number | null
          discount_code?: string | null
          final_amount: number
          id?: string
          payment_gateway: Database["public"]["Enums"]["payment_gateway"]
          payment_items?: Json | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          transaction_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          article_ids?: string[]
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"]
          discount_amount?: number | null
          discount_code?: string | null
          final_amount?: number
          id?: string
          payment_gateway?: Database["public"]["Enums"]["payment_gateway"]
          payment_items?: Json | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          transaction_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_usage: {
        Row: {
          coauthor_certs_used: number
          id: string
          review_reports_used: number
          updated_at: string
          usage_month: string
          user_id: string
        }
        Insert: {
          coauthor_certs_used?: number
          id?: string
          review_reports_used?: number
          updated_at?: string
          usage_month: string
          user_id: string
        }
        Update: {
          coauthor_certs_used?: number
          id?: string
          review_reports_used?: number
          updated_at?: string
          usage_month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          affiliation: string | null
          avatar_url: string | null
          country: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_indian: boolean | null
          referral_code: string | null
        }
        Insert: {
          affiliation?: string | null
          avatar_url?: string | null
          country?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          is_indian?: boolean | null
          referral_code?: string | null
        }
        Update: {
          affiliation?: string | null
          avatar_url?: string | null
          country?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_indian?: boolean | null
          referral_code?: string | null
        }
        Relationships: []
      }
      publication_fees: {
        Row: {
          binance_wallet_address: string | null
          id: string
          indian_coauthor_fee: number | null
          indian_fast_track_fee: number | null
          indian_fee: number | null
          indian_pro_fee: number | null
          international_coauthor_fee: number | null
          international_fast_track_fee: number | null
          international_fee: number | null
          international_pro_fee: number | null
          updated_at: string | null
          updated_by: string | null
          usdt_coauthor_fee: number | null
          usdt_fast_track_fee: number | null
          usdt_fee: number | null
          usdt_pro_fee: number | null
        }
        Insert: {
          binance_wallet_address?: string | null
          id?: string
          indian_coauthor_fee?: number | null
          indian_fast_track_fee?: number | null
          indian_fee?: number | null
          indian_pro_fee?: number | null
          international_coauthor_fee?: number | null
          international_fast_track_fee?: number | null
          international_fee?: number | null
          international_pro_fee?: number | null
          updated_at?: string | null
          updated_by?: string | null
          usdt_coauthor_fee?: number | null
          usdt_fast_track_fee?: number | null
          usdt_fee?: number | null
          usdt_pro_fee?: number | null
        }
        Update: {
          binance_wallet_address?: string | null
          id?: string
          indian_coauthor_fee?: number | null
          indian_fast_track_fee?: number | null
          indian_fee?: number | null
          indian_pro_fee?: number | null
          international_coauthor_fee?: number | null
          international_fast_track_fee?: number | null
          international_fee?: number | null
          international_pro_fee?: number | null
          updated_at?: string | null
          updated_by?: string | null
          usdt_coauthor_fee?: number | null
          usdt_fast_track_fee?: number | null
          usdt_fee?: number | null
          usdt_pro_fee?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "publication_fees_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      publication_form_data: {
        Row: {
          abstract: string | null
          article_id: string
          article_title: string | null
          co_authors_names: string | null
          correspondence_author_name: string | null
          country: string | null
          created_at: string
          created_by: string | null
          description: string | null
          doi: string | null
          final_pdf_url: string | null
          id: string
          keywords: string | null
          publication_year_month: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          abstract?: string | null
          article_id: string
          article_title?: string | null
          co_authors_names?: string | null
          correspondence_author_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          doi?: string | null
          final_pdf_url?: string | null
          id?: string
          keywords?: string | null
          publication_year_month?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          abstract?: string | null
          article_id?: string
          article_title?: string | null
          co_authors_names?: string | null
          correspondence_author_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          doi?: string | null
          final_pdf_url?: string | null
          id?: string
          keywords?: string | null
          publication_year_month?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referral_email_sent_at: string | null
          referred_id: string
          referrer_id: string
          reward_granted: boolean
          rewarded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          referral_email_sent_at?: string | null
          referred_id: string
          referrer_id: string
          reward_granted?: boolean
          rewarded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          referral_email_sent_at?: string | null
          referred_id?: string
          referrer_id?: string
          reward_granted?: boolean
          rewarded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_settings: {
        Row: {
          email_from_override: string | null
          email_provider_override: string | null
          frequency_hours: number
          id: string
          last_fee_submission_date: string | null
          low_score_email_enabled: boolean
          low_score_from_override: string | null
          low_score_provider_override: string | null
          max_article_age_days: number
          max_days: number
          max_emails_per_author: number
          max_emails_per_day: number
          min_article_age_days: number
          updated_at: string
          updated_by: string | null
          urgency_high_after_days: number
          urgency_informational_after_days: number
          urgency_moderate_after_days: number
        }
        Insert: {
          email_from_override?: string | null
          email_provider_override?: string | null
          frequency_hours?: number
          id?: string
          last_fee_submission_date?: string | null
          low_score_email_enabled?: boolean
          low_score_from_override?: string | null
          low_score_provider_override?: string | null
          max_article_age_days?: number
          max_days?: number
          max_emails_per_author?: number
          max_emails_per_day?: number
          min_article_age_days?: number
          updated_at?: string
          updated_by?: string | null
          urgency_high_after_days?: number
          urgency_informational_after_days?: number
          urgency_moderate_after_days?: number
        }
        Update: {
          email_from_override?: string | null
          email_provider_override?: string | null
          frequency_hours?: number
          id?: string
          last_fee_submission_date?: string | null
          low_score_email_enabled?: boolean
          low_score_from_override?: string | null
          low_score_provider_override?: string | null
          max_article_age_days?: number
          max_days?: number
          max_emails_per_author?: number
          max_emails_per_day?: number
          min_article_age_days?: number
          updated_at?: string
          updated_by?: string | null
          urgency_high_after_days?: number
          urgency_informational_after_days?: number
          urgency_moderate_after_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "reminder_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_report_downloads: {
        Row: {
          article_id: string
          author_id: string
          created_at: string
          download_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          article_id: string
          author_id: string
          created_at?: string
          download_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          article_id?: string
          author_id?: string
          created_at?: string
          download_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_report_downloads_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_report_downloads_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "published_articles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_broadcasts: {
        Row: {
          created_at: string
          created_by: string
          email_from: string | null
          email_provider_override: string | null
          emails_failed: number | null
          emails_sent: number | null
          error_message: string | null
          id: string
          link: string | null
          message: string
          notification_type: string
          notifications_sent: number | null
          processed_at: string | null
          recipients: Json
          scheduled_for: string
          send_email: boolean
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          email_from?: string | null
          email_provider_override?: string | null
          emails_failed?: number | null
          emails_sent?: number | null
          error_message?: string | null
          id?: string
          link?: string | null
          message: string
          notification_type?: string
          notifications_sent?: number | null
          processed_at?: string | null
          recipients: Json
          scheduled_for: string
          send_email?: boolean
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          email_from?: string | null
          email_provider_override?: string | null
          emails_failed?: number | null
          emails_sent?: number | null
          error_message?: string | null
          id?: string
          link?: string | null
          message?: string
          notification_type?: string
          notifications_sent?: number | null
          processed_at?: string | null
          recipients?: Json
          scheduled_for?: string
          send_email?: boolean
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          ai_confidence: number | null
          ai_suggested_answer: string | null
          answered_at: string | null
          answered_by: string | null
          assigned_to: string | null
          author_email: string | null
          author_name: string | null
          category: string | null
          conversation_id: string | null
          created_at: string
          human_answer: string | null
          id: string
          learned: boolean
          priority: string
          question: string
          question_embedding: string | null
          reference_number: string | null
          status: string
          tags: string[]
          transcript: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_suggested_answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          assigned_to?: string | null
          author_email?: string | null
          author_name?: string | null
          category?: string | null
          conversation_id?: string | null
          created_at?: string
          human_answer?: string | null
          id?: string
          learned?: boolean
          priority?: string
          question: string
          question_embedding?: string | null
          reference_number?: string | null
          status?: string
          tags?: string[]
          transcript?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_suggested_answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          assigned_to?: string | null
          author_email?: string | null
          author_name?: string | null
          category?: string | null
          conversation_id?: string | null
          created_at?: string
          human_answer?: string | null
          id?: string
          learned?: boolean
          priority?: string
          question?: string
          question_embedding?: string | null
          reference_number?: string | null
          status?: string
          tags?: string[]
          transcript?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          auto_renew: boolean
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          payment_id: string | null
          paypal_subscription_id: string | null
          plan_type: string
          razorpay_subscription_id: string | null
          review_reports_grant: number | null
          starts_at: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          payment_id?: string | null
          paypal_subscription_id?: string | null
          plan_type?: string
          razorpay_subscription_id?: string | null
          review_reports_grant?: number | null
          starts_at?: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          payment_id?: string | null
          paypal_subscription_id?: string | null
          plan_type?: string
          razorpay_subscription_id?: string | null
          review_reports_grant?: number | null
          starts_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      co_authors_public: {
        Row: {
          affiliation: string | null
          article_id: string | null
          id: string | null
          name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "co_authors_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_authors_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "published_articles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      publication_fees_public: {
        Row: {
          id: string | null
          indian_coauthor_fee: number | null
          indian_fast_track_fee: number | null
          indian_fee: number | null
          indian_pro_fee: number | null
          international_coauthor_fee: number | null
          international_fast_track_fee: number | null
          international_fee: number | null
          international_pro_fee: number | null
          updated_at: string | null
          usdt_coauthor_fee: number | null
          usdt_fast_track_fee: number | null
          usdt_fee: number | null
          usdt_pro_fee: number | null
        }
        Insert: {
          id?: string | null
          indian_coauthor_fee?: number | null
          indian_fast_track_fee?: number | null
          indian_fee?: number | null
          indian_pro_fee?: number | null
          international_coauthor_fee?: number | null
          international_fast_track_fee?: number | null
          international_fee?: number | null
          international_pro_fee?: number | null
          updated_at?: string | null
          usdt_coauthor_fee?: number | null
          usdt_fast_track_fee?: number | null
          usdt_fee?: number | null
          usdt_pro_fee?: number | null
        }
        Update: {
          id?: string | null
          indian_coauthor_fee?: number | null
          indian_fast_track_fee?: number | null
          indian_fee?: number | null
          indian_pro_fee?: number | null
          international_coauthor_fee?: number | null
          international_fast_track_fee?: number | null
          international_fee?: number | null
          international_pro_fee?: number | null
          updated_at?: string | null
          usdt_coauthor_fee?: number | null
          usdt_fast_track_fee?: number | null
          usdt_fee?: number | null
          usdt_pro_fee?: number | null
        }
        Relationships: []
      }
      published_articles_public: {
        Row: {
          abstract: string | null
          author_name: string | null
          country: string | null
          created_at: string | null
          display_order: number | null
          id: string | null
          issue: string | null
          keywords: string[] | null
          page_number: string | null
          publication_type: string | null
          publication_year: string | null
          publish_queue_added_at: string | null
          published_link: string | null
          published_tier: string | null
          reference_number: string | null
          subject: string | null
          title: string | null
          updated_at: string | null
          volume: string | null
        }
        Insert: {
          abstract?: string | null
          author_name?: string | null
          country?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string | null
          issue?: string | null
          keywords?: string[] | null
          page_number?: string | null
          publication_type?: string | null
          publication_year?: string | null
          publish_queue_added_at?: string | null
          published_link?: string | null
          published_tier?: string | null
          reference_number?: string | null
          subject?: string | null
          title?: string | null
          updated_at?: string | null
          volume?: string | null
        }
        Update: {
          abstract?: string | null
          author_name?: string | null
          country?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string | null
          issue?: string | null
          keywords?: string[] | null
          page_number?: string | null
          publication_type?: string | null
          publication_year?: string | null
          publish_queue_added_at?: string | null
          published_link?: string | null
          published_tier?: string | null
          reference_number?: string | null
          subject?: string | null
          title?: string | null
          updated_at?: string | null
          volume?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_default_auto_apply_discount: {
        Args: never
        Returns: {
          applies_to: string
          article_position_limit: string
          code: string
          currency: Database["public"]["Enums"]["discount_currency"]
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          end_date: string
          id: string
          is_active: boolean
          max_uses_per_user: number
          specific_article_ids: string[]
          start_date: string
          usage_limit: number
          used_count: number
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_plan_usage: {
        Args: { p_field: string; p_usage_month: string; p_user_id: string }
        Returns: undefined
      }
      is_email_category_enabled: {
        Args: { _author_id: string; _category: string }
        Returns: boolean
      }
      lookup_discount_code: {
        Args: { p_code: string }
        Returns: {
          applies_to: string
          article_position_limit: string
          code: string
          currency: Database["public"]["Enums"]["discount_currency"]
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          end_date: string
          id: string
          is_active: boolean
          max_uses_per_user: number
          specific_article_ids: string[]
          start_date: string
          usage_limit: number
          used_count: number
        }[]
      }
      match_faq: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          answer: string
          category: string
          id: string
          question: string
          similarity: number
        }[]
      }
      match_knowledge_base: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          category: string
          content: string
          id: string
          question: string
          similarity: number
          title: string
        }[]
      }
      match_support_tickets: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          human_answer: string
          id: string
          question: string
          similarity: number
        }[]
      }
    }
    Enums: {
      article_status:
        | "submitted"
        | "under_review"
        | "manuscript_accepted"
        | "pending_fee"
        | "paid"
        | "payment_under_review"
        | "failed_payment"
        | "published"
        | "rejected"
        | "withdrawn"
        | "copyright_received"
        | "ai_review_generated"
        | "revision_requested"
        | "revised_submitted"
        | "revised_review_generated"
        | "galley_proof_sent"
        | "galley_proof_approved"
        | "galley_proof_revised"
        | "free"
        | "published_to_wwjmrd"
        | "update_under_process"
        | "updated_published"
      coauthor_payment_status: "pending" | "paid" | "failed"
      currency_type: "INR" | "USD" | "USDT"
      discount_currency: "INR" | "USD" | "BOTH" | "USDT"
      discount_type: "percentage" | "fixed"
      payment_gateway: "razorpay" | "paypal" | "binance" | "manual"
      payment_status: "pending" | "success" | "failed" | "under_review"
      user_role: "author" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      article_status: [
        "submitted",
        "under_review",
        "manuscript_accepted",
        "pending_fee",
        "paid",
        "payment_under_review",
        "failed_payment",
        "published",
        "rejected",
        "withdrawn",
        "copyright_received",
        "ai_review_generated",
        "revision_requested",
        "revised_submitted",
        "revised_review_generated",
        "galley_proof_sent",
        "galley_proof_approved",
        "galley_proof_revised",
        "free",
        "published_to_wwjmrd",
        "update_under_process",
        "updated_published",
      ],
      coauthor_payment_status: ["pending", "paid", "failed"],
      currency_type: ["INR", "USD", "USDT"],
      discount_currency: ["INR", "USD", "BOTH", "USDT"],
      discount_type: ["percentage", "fixed"],
      payment_gateway: ["razorpay", "paypal", "binance", "manual"],
      payment_status: ["pending", "success", "failed", "under_review"],
      user_role: ["author", "admin"],
    },
  },
} as const
