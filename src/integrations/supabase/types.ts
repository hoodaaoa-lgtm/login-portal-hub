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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: string | null
          id: string
          target_label: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: string | null
          id?: string
          target_label?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: string | null
          id?: string
          target_label?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      book_downloads: {
        Row: {
          book_id: string
          created_at: string
          id: string
          user_id: string | null
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          user_id?: string | null
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_downloads_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_ratings: {
        Row: {
          book_id: string
          created_at: string
          id: string
          stars: number
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          stars: number
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          stars?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_ratings_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "stories_books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_saves: {
        Row: {
          book_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_saves_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author_name: string | null
          category: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          downloads: number
          file_format: string | null
          file_url: string
          id: string
          saves: number
          title: string
          uploader_id: string | null
        }
        Insert: {
          author_name?: string | null
          category?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          downloads?: number
          file_format?: string | null
          file_url: string
          id?: string
          saves?: number
          title: string
          uploader_id?: string | null
        }
        Update: {
          author_name?: string | null
          category?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          downloads?: number
          file_format?: string | null
          file_url?: string
          id?: string
          saves?: number
          title?: string
          uploader_id?: string | null
        }
        Relationships: []
      }
      content_moderation_log: {
        Row: {
          category: string
          confidence: number | null
          created_at: string
          id: string
          model: string
          post_id: string
          raw_result: Json | null
        }
        Insert: {
          category: string
          confidence?: number | null
          created_at?: string
          id?: string
          model?: string
          post_id: string
          raw_result?: Json | null
        }
        Update: {
          category?: string
          confidence?: number | null
          created_at?: string
          id?: string
          model?: string
          post_id?: string
          raw_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "content_moderation_log_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_quality: {
        Row: {
          computed_at: string
          post_id: string
          quality_engagement: number
          quality_originality: number
          quality_satisfaction: number
          quality_score: number
          quality_technical: number
        }
        Insert: {
          computed_at?: string
          post_id: string
          quality_engagement?: number
          quality_originality?: number
          quality_satisfaction?: number
          quality_score?: number
          quality_technical?: number
        }
        Update: {
          computed_at?: string
          post_id?: string
          quality_engagement?: number
          quality_originality?: number
          quality_satisfaction?: number
          quality_score?: number
          quality_technical?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_quality_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_key_shares: {
        Row: {
          conversation_id: string
          created_at: string
          encrypted_key: string
          id: string
          sender_public_key: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          encrypted_key: string
          id?: string
          sender_public_key: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          encrypted_key?: string
          id?: string
          sender_public_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_key_shares_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          is_official: boolean
          reply_allowed: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          is_official?: boolean
          reply_allowed?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          is_official?: boolean
          reply_allowed?: boolean
        }
        Relationships: []
      }
      drop_comments: {
        Row: {
          author_username: string
          content: string
          created_at: string
          drop_id: string
          id: string
          user_id: string
        }
        Insert: {
          author_username?: string
          content: string
          created_at?: string
          drop_id: string
          id?: string
          user_id: string
        }
        Update: {
          author_username?: string
          content?: string
          created_at?: string
          drop_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drop_comments_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drops"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_interactions: {
        Row: {
          created_at: string
          drop_id: string
          id: string
          interaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          drop_id: string
          id?: string
          interaction_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          drop_id?: string
          id?: string
          interaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drop_interactions_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drops"
            referencedColumns: ["id"]
          },
        ]
      }
      drops: {
        Row: {
          aspect_ratio: number | null
          author_username: string
          comments_count: number
          content_type: string
          content_url: string | null
          created_at: string
          duration_hours: number
          expires_at: string
          id: string
          likes_count: number
          music_title: string | null
          music_url: string | null
          reposts_count: number
          shares_count: number
          text_content: string | null
          user_id: string
          views_count: number
        }
        Insert: {
          aspect_ratio?: number | null
          author_username?: string
          comments_count?: number
          content_type: string
          content_url?: string | null
          created_at?: string
          duration_hours?: number
          expires_at?: string
          id?: string
          likes_count?: number
          music_title?: string | null
          music_url?: string | null
          reposts_count?: number
          shares_count?: number
          text_content?: string | null
          user_id: string
          views_count?: number
        }
        Update: {
          aspect_ratio?: number | null
          author_username?: string
          comments_count?: number
          content_type?: string
          content_url?: string | null
          created_at?: string
          duration_hours?: number
          expires_at?: string
          id?: string
          likes_count?: number
          music_title?: string | null
          music_url?: string | null
          reposts_count?: number
          shares_count?: number
          text_content?: string | null
          user_id?: string
          views_count?: number
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string | null
          target_username: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id?: string | null
          target_username: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string | null
          target_username?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_requests: {
        Row: {
          created_at: string
          id: string
          preview_text: string | null
          receiver_id: string
          sender_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          preview_text?: string | null
          receiver_id: string
          sender_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          preview_text?: string | null
          receiver_id?: string
          sender_id?: string
          status?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          deleted_for_all: boolean
          duration: number | null
          edited_at: string | null
          id: string
          is_surprise: boolean
          media_url: string | null
          message_type: string
          reactions: Json
          receiver_id: string | null
          reply_to: string | null
          sender_id: string
          status: string
          style: Json | null
          surprise_opened_by: string[]
          surprise_teaser: string | null
          view_once: boolean
          view_once_opened_by: string[]
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          deleted_for_all?: boolean
          duration?: number | null
          edited_at?: string | null
          id?: string
          is_surprise?: boolean
          media_url?: string | null
          message_type?: string
          reactions?: Json
          receiver_id?: string | null
          reply_to?: string | null
          sender_id: string
          status?: string
          style?: Json | null
          surprise_opened_by?: string[]
          surprise_teaser?: string | null
          view_once?: boolean
          view_once_opened_by?: string[]
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          deleted_for_all?: boolean
          duration?: number | null
          edited_at?: string | null
          id?: string
          is_surprise?: boolean
          media_url?: string | null
          message_type?: string
          reactions?: Json
          receiver_id?: string | null
          reply_to?: string | null
          sender_id?: string
          status?: string
          style?: Json | null
          surprise_opened_by?: string[]
          surprise_teaser?: string | null
          view_once?: boolean
          view_once_opened_by?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      muted_conversations: {
        Row: {
          conversation_id: string
          created_at: string
          muted: boolean
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          muted?: boolean
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          muted?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "muted_conversations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          actor_username: string | null
          comment_id: string | null
          created_at: string
          id: string
          post_id: string | null
          read: boolean
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_username?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          read?: boolean
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          actor_username?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          read?: boolean
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_videos: {
        Row: {
          id: string
          playlist_id: string
          position: number
          video_id: string
        }
        Insert: {
          id?: string
          playlist_id: string
          position?: number
          video_id: string
        }
        Update: {
          id?: string
          playlist_id?: string
          position?: number
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_videos_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_videos_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          cover_image_url: string | null
          cover_video_id: string | null
          created_at: string
          description: string | null
          id: string
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          cover_video_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          owner_id: string
          title: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          cover_video_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlists_cover_video_id_fkey"
            columns: ["cover_video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          id: string
          option_index: number
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_index: number
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_index?: number
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_color: string | null
          author_id: string | null
          author_username: string
          content: string
          created_at: string
          id: string
          parent_comment_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          author_color?: string | null
          author_id?: string | null
          author_username: string
          content: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          author_color?: string | null
          author_id?: string | null
          author_username?: string
          content?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_hidden: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_hidden_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_impressions: {
        Row: {
          author_id: string | null
          created_at: string
          dwell_ms: number
          id: string
          kind: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          dwell_ms?: number
          id?: string
          kind?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          author_id?: string | null
          created_at?: string
          dwell_ms?: number
          id?: string
          kind?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: []
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_quotes: {
        Row: {
          author_id: string
          author_username: string
          content: string
          created_at: string
          id: string
          media_type: string | null
          media_url: string | null
          original_post_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          author_username: string
          content: string
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          original_post_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          author_username?: string
          content?: string
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          original_post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_quotes_original_post_id_fkey"
            columns: ["original_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_replies: {
        Row: {
          author_color: string
          author_id: string
          author_username: string
          content: string
          created_at: string
          id: string
          media_type: string | null
          media_url: string | null
          post_id: string
          updated_at: string
        }
        Insert: {
          author_color?: string
          author_id: string
          author_username: string
          content: string
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          post_id: string
          updated_at?: string
        }
        Update: {
          author_color?: string
          author_id?: string
          author_username?: string
          content?: string
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_replies_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reposts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reposts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_saves: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_saves_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_views: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string | null
          viewer_fingerprint: string
          watch_seconds: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id?: string | null
          viewer_fingerprint: string
          watch_seconds?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string | null
          viewer_fingerprint?: string
          watch_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          audio_url: string | null
          author_color: string | null
          author_id: string | null
          author_name: string | null
          author_username: string
          category: string | null
          channel_avatar: string | null
          channel_handle: string | null
          channel_name: string | null
          clip_end: number | null
          clip_start: number | null
          clip_thumb_url: string | null
          clip_title: string | null
          clip_video_id: string | null
          comments_count: number
          content: string
          created_at: string
          emoji: string | null
          hashtags: string[] | null
          id: string
          image_url: string | null
          is_ad: boolean
          is_draft: boolean
          is_sensitive: boolean
          kind: string | null
          likes_count: number
          moderation_categories: Json | null
          moderation_checked_at: string | null
          moderation_status: string
          music_artist: string | null
          music_cover: string | null
          music_title: string | null
          music_url: string | null
          photo_url: string | null
          photos: string[] | null
          poll: Json | null
          poll_ends_at: string | null
          quotes_count: number
          replies_count: number
          reposts_count: number
          scheduled_at: string | null
          shared_from_post_id: string | null
          thumbnail_url: string | null
          title: string | null
          video_embed_url: string | null
          video_stream_url: string | null
          video_url: string | null
          views_count: number
          visibility: string
        }
        Insert: {
          audio_url?: string | null
          author_color?: string | null
          author_id?: string | null
          author_name?: string | null
          author_username: string
          category?: string | null
          channel_avatar?: string | null
          channel_handle?: string | null
          channel_name?: string | null
          clip_end?: number | null
          clip_start?: number | null
          clip_thumb_url?: string | null
          clip_title?: string | null
          clip_video_id?: string | null
          comments_count?: number
          content: string
          created_at?: string
          emoji?: string | null
          hashtags?: string[] | null
          id?: string
          image_url?: string | null
          is_ad?: boolean
          is_draft?: boolean
          is_sensitive?: boolean
          kind?: string | null
          likes_count?: number
          moderation_categories?: Json | null
          moderation_checked_at?: string | null
          moderation_status?: string
          music_artist?: string | null
          music_cover?: string | null
          music_title?: string | null
          music_url?: string | null
          photo_url?: string | null
          photos?: string[] | null
          poll?: Json | null
          poll_ends_at?: string | null
          quotes_count?: number
          replies_count?: number
          reposts_count?: number
          scheduled_at?: string | null
          shared_from_post_id?: string | null
          thumbnail_url?: string | null
          title?: string | null
          video_embed_url?: string | null
          video_stream_url?: string | null
          video_url?: string | null
          views_count?: number
          visibility?: string
        }
        Update: {
          audio_url?: string | null
          author_color?: string | null
          author_id?: string | null
          author_name?: string | null
          author_username?: string
          category?: string | null
          channel_avatar?: string | null
          channel_handle?: string | null
          channel_name?: string | null
          clip_end?: number | null
          clip_start?: number | null
          clip_thumb_url?: string | null
          clip_title?: string | null
          clip_video_id?: string | null
          comments_count?: number
          content?: string
          created_at?: string
          emoji?: string | null
          hashtags?: string[] | null
          id?: string
          image_url?: string | null
          is_ad?: boolean
          is_draft?: boolean
          is_sensitive?: boolean
          kind?: string | null
          likes_count?: number
          moderation_categories?: Json | null
          moderation_checked_at?: string | null
          moderation_status?: string
          music_artist?: string | null
          music_cover?: string | null
          music_title?: string | null
          music_url?: string | null
          photo_url?: string | null
          photos?: string[] | null
          poll?: Json | null
          poll_ends_at?: string | null
          quotes_count?: number
          replies_count?: number
          reposts_count?: number
          scheduled_at?: string | null
          shared_from_post_id?: string | null
          thumbnail_url?: string | null
          title?: string | null
          video_embed_url?: string | null
          video_stream_url?: string | null
          video_url?: string | null
          views_count?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_clip_video_id_fkey"
            columns: ["clip_video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_shared_from_post_id_fkey"
            columns: ["shared_from_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number | null
          avatar_color: string | null
          avatar_url: string | null
          ban_reason: string | null
          banner_url: string | null
          bio: string | null
          categorias: string[]
          category: string | null
          country: string | null
          cover_url: string | null
          created_at: string
          e2ee_public_key: string | null
          followers_count: number
          following_count: number
          full_name: string
          hide_last_seen: boolean
          id: string
          is_banned: boolean
          is_online: boolean
          is_private: boolean
          is_verified: boolean
          last_seen: string | null
          location: string | null
          msg_permission: string
          notification_prefs: Json
          phone_number: string | null
          read_receipts_off: boolean
          total_time_seconds: number
          updated_at: string
          username: string
          username_changed_at: string | null
          website: string | null
        }
        Insert: {
          age?: number | null
          avatar_color?: string | null
          avatar_url?: string | null
          ban_reason?: string | null
          banner_url?: string | null
          bio?: string | null
          categorias?: string[]
          category?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string
          e2ee_public_key?: string | null
          followers_count?: number
          following_count?: number
          full_name: string
          hide_last_seen?: boolean
          id: string
          is_banned?: boolean
          is_online?: boolean
          is_private?: boolean
          is_verified?: boolean
          last_seen?: string | null
          location?: string | null
          msg_permission?: string
          notification_prefs?: Json
          phone_number?: string | null
          read_receipts_off?: boolean
          total_time_seconds?: number
          updated_at?: string
          username: string
          username_changed_at?: string | null
          website?: string | null
        }
        Update: {
          age?: number | null
          avatar_color?: string | null
          avatar_url?: string | null
          ban_reason?: string | null
          banner_url?: string | null
          bio?: string | null
          categorias?: string[]
          category?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string
          e2ee_public_key?: string | null
          followers_count?: number
          following_count?: number
          full_name?: string
          hide_last_seen?: boolean
          id?: string
          is_banned?: boolean
          is_online?: boolean
          is_private?: boolean
          is_verified?: boolean
          last_seen?: string | null
          location?: string | null
          msg_permission?: string
          notification_prefs?: Json
          phone_number?: string | null
          read_receipts_off?: boolean
          total_time_seconds?: number
          updated_at?: string
          username?: string
          username_changed_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      reposts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          quote_text: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          quote_text?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          quote_text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reposts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_books: {
        Row: {
          book_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_books_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "stories_books"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_videos: {
        Row: {
          created_at: string
          id: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_videos_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      stories_books: {
        Row: {
          author_id: string
          author_username: string
          average_rating: number | null
          chapter_count: number
          cover_color: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          downloads_count: number
          id: string
          rating_count: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          author_username?: string
          average_rating?: number | null
          chapter_count?: number
          cover_color?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          downloads_count?: number
          id?: string
          rating_count?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          author_username?: string
          average_rating?: number | null
          chapter_count?: number
          cover_color?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          downloads_count?: number
          id?: string
          rating_count?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_events: {
        Row: {
          author_id: string | null
          category: string | null
          context: Json | null
          created_at: string
          dwell_ms: number | null
          event_type: string
          id: number
          session_id: string | null
          target_id: string | null
          target_type: string | null
          user_id: string | null
          weight: number | null
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          context?: Json | null
          created_at?: string
          dwell_ms?: number | null
          event_type: string
          id?: number
          session_id?: string | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
          weight?: number | null
        }
        Update: {
          author_id?: string | null
          category?: string | null
          context?: Json | null
          created_at?: string
          dwell_ms?: number | null
          event_type?: string
          id?: number
          session_id?: string | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
          weight?: number | null
        }
        Relationships: []
      }
      user_hidden_categories: {
        Row: {
          category: string
          created_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_interest_scores: {
        Row: {
          category: string
          score_long: number
          score_medium: number
          score_short: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          score_long?: number
          score_medium?: number
          score_short?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          score_long?: number
          score_medium?: number
          score_short?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_interests: {
        Row: {
          author_id: string
          id: string
          interactions: number
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          author_id: string
          id?: string
          interactions?: number
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          author_id?: string
          id?: string
          interactions?: number
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rated_user_id: string
          rater_user_id: string
          stars: number
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rated_user_id: string
          rater_user_id: string
          stars: number
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rated_user_id?: string
          rater_user_id?: string
          stars?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          reason: string
          reported_user_id: string
          reporter_id: string
          reviewed_at: string | null
          status: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          reason: string
          reported_user_id: string
          reporter_id: string
          reviewed_at?: string | null
          status?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          reason?: string
          reported_user_id?: string
          reporter_id?: string
          reviewed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      video_comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          emoji: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          emoji: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          emoji?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "video_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      video_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          parent_id: string | null
          updated_at: string
          user_id: string
          video_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
          user_id: string
          video_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "video_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_comments_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_comments_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_dislikes: {
        Row: {
          created_at: string
          id: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_dislikes_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_likes: {
        Row: {
          created_at: string
          id: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_likes_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_views: {
        Row: {
          country: string | null
          country_code: string | null
          id: string
          profile_id: string
          user_id: string | null
          video_id: string
          viewed_at: string
          viewer_fingerprint: string | null
          watch_pct: number | null
          watch_seconds: number | null
        }
        Insert: {
          country?: string | null
          country_code?: string | null
          id?: string
          profile_id: string
          user_id?: string | null
          video_id: string
          viewed_at?: string
          viewer_fingerprint?: string | null
          watch_pct?: number | null
          watch_seconds?: number | null
        }
        Update: {
          country?: string | null
          country_code?: string | null
          id?: string
          profile_id?: string
          user_id?: string | null
          video_id?: string
          viewed_at?: string
          viewer_fingerprint?: string | null
          watch_pct?: number | null
          watch_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_views_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          category: string | null
          cf_embed_url: string | null
          cf_stream_uid: string | null
          cf_stream_url: string | null
          comments_count: number
          created_at: string
          description: string | null
          duration_seconds: number | null
          file_size: number | null
          id: string
          likes_count: number
          override_signature: boolean | null
          override_watermark: boolean | null
          owner_id: string
          published_at: string | null
          status: Database["public"]["Enums"]["video_status"]
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_path: string | null
          views_count: number
          visibility: Database["public"]["Enums"]["video_visibility"]
        }
        Insert: {
          category?: string | null
          cf_embed_url?: string | null
          cf_stream_uid?: string | null
          cf_stream_url?: string | null
          comments_count?: number
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          id?: string
          likes_count?: number
          override_signature?: boolean | null
          override_watermark?: boolean | null
          owner_id: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["video_status"]
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_path?: string | null
          views_count?: number
          visibility?: Database["public"]["Enums"]["video_visibility"]
        }
        Update: {
          category?: string | null
          cf_embed_url?: string | null
          cf_stream_uid?: string | null
          cf_stream_url?: string | null
          comments_count?: number
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          id?: string
          likes_count?: number
          override_signature?: boolean | null
          override_watermark?: boolean | null
          owner_id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["video_status"]
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_path?: string | null
          views_count?: number
          visibility?: Database["public"]["Enums"]["video_visibility"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_account: { Args: { target_id: string }; Returns: undefined }
      apply_content_moderation: {
        Args: {
          p_category: string
          p_confidence: number
          p_post_id: string
          p_raw_result?: Json
        }
        Returns: undefined
      }
      cleanup_expired_drops: { Args: never; Returns: undefined }
      cleanup_expired_stories: { Args: never; Returns: undefined }
      create_conversation_with_participants: {
        Args: { p_my_id: string; p_other_id: string }
        Returns: string
      }
      create_official_conversation: {
        Args: { p_other_id: string }
        Returns: string
      }
      decay_interest_scores: { Args: never; Returns: undefined }
      decrement_post_replies: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      decrement_post_reposts: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      get_book_file_url: { Args: { p_book_id: string }; Returns: string }
      get_contact_presence: {
        Args: { p_user_id: string }
        Returns: {
          is_online: boolean
          last_seen: string
        }[]
      }
      admin_listar_cadastros: {
        Args: never
        Returns: {
          id: string
          username: string
          full_name: string
          categorias: string[]
          email: string
          gmail_confirmado: boolean
          is_verified: boolean
          is_banned: boolean
          ban_reason: string | null
          created_at: string
        }[]
      }
      get_hooda_official_id: { Args: never; Returns: string }
      get_library_book_file: {
        Args: { p_book_id: string }
        Returns: {
          file_data: string
          file_name: string
        }[]
      }
      get_my_profile_private: {
        Args: never
        Returns: {
          hide_last_seen: boolean
          notification_prefs: Json
          phone_number: string
          read_receipts_off: boolean
        }[]
      }
      get_personalized_feed: {
        Args: { p_cursor?: string; p_limit?: number; p_user_id: string }
        Returns: {
          bucket: string
          post_id: string
          rank_score: number
        }[]
      }
      get_user_interest_profile: {
        Args: { p_limit?: number }
        Returns: {
          category: string
          combined: number
          score_long: number
          score_medium: number
          score_short: number
        }[]
      }
      heartbeat_ping: {
        Args: { p_interval_seconds?: number }
        Returns: undefined
      }
      hide_similar_content: { Args: { p_category: string }; Returns: undefined }
      increment_book_download: {
        Args: { p_book_id: string }
        Returns: undefined
      }
      increment_library_book_counter: {
        Args: { p_book_id: string; p_counter: string }
        Returns: undefined
      }
      increment_post_quotes: { Args: { p_post_id: string }; Returns: undefined }
      increment_post_replies: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      increment_post_reposts: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      is_community_member: {
        Args: { _community_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      is_hooda_admin: { Args: never; Returns: boolean }
      mark_offline: { Args: never; Returns: undefined }
      mark_surprise_opened: {
        Args: { p_msg_id: string; p_user_id: string }
        Returns: undefined
      }
      mark_view_once_opened: {
        Args: { p_msg_id: string; p_user_id: string }
        Returns: undefined
      }
      recompute_content_quality: {
        Args: { p_post_id: string }
        Returns: number
      }
      record_post_view: {
        Args: {
          p_duration_seconds?: number
          p_post_id: string
          p_viewer_fingerprint: string
          p_watch_seconds?: number
        }
        Returns: Json
      }
      record_video_view: {
        Args: {
          p_channel_id?: string
          p_country?: string
          p_country_code?: string
          p_duration_seconds?: number
          p_video_id: string
          p_viewer_fingerprint?: string
          p_watch_seconds?: number
        }
        Returns: Json
      }
      set_post_technical_quality: {
        Args: { p_post_id: string; p_score: number }
        Returns: undefined
      }
      toggle_follow: {
        Args: { p_target_id?: string; p_target_username: string }
        Returns: Json
      }
      toggle_post_like: { Args: { p_post_id: string }; Returns: Json }
      toggle_video_like: { Args: { p_video_id: string }; Returns: Json }
      track_event: {
        Args: {
          p_author_id?: string
          p_category?: string
          p_context?: Json
          p_dwell_ms?: number
          p_event_type: string
          p_session_id?: string
          p_target_id?: string
          p_target_type?: string
          p_weight?: number
        }
        Returns: undefined
      }
      unhide_category: { Args: { p_category: string }; Returns: undefined }
      update_book_rating_average: {
        Args: { p_book_id: string }
        Returns: {
          avg_rating: number
          count: number
        }[]
      }
    }
    Enums: {
      video_status: "processing" | "published" | "failed"
      video_visibility: "public" | "private" | "unlisted"
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
      video_status: ["processing", "published", "failed"],
      video_visibility: ["public", "private", "unlisted"],
    },
  },
} as const
