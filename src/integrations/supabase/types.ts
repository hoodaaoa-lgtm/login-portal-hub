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
      channel_follows: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_follows_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel_stats_view"
            referencedColumns: ["channel_id"]
          },
          {
            foreignKeyName: "channel_follows_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          category: string | null
          country: string | null
          created_at: string
          description: string | null
          handle: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          category?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          handle: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          category?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          handle?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      communities: {
        Row: {
          allow_search: boolean
          category: string | null
          cover_color: string | null
          created_at: string
          description: string | null
          emoji: string | null
          id: string
          invite_code: string | null
          member_count: number
          name: string
          owner_id: string
          photo_url: string | null
          privacy: string
          slug: string
        }
        Insert: {
          allow_search?: boolean
          category?: string | null
          cover_color?: string | null
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          invite_code?: string | null
          member_count?: number
          name: string
          owner_id: string
          photo_url?: string | null
          privacy?: string
          slug?: string
        }
        Update: {
          allow_search?: boolean
          category?: string | null
          cover_color?: string | null
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          invite_code?: string | null
          member_count?: number
          name?: string
          owner_id?: string
          photo_url?: string | null
          privacy?: string
          slug?: string
        }
        Relationships: []
      }
      community_bans: {
        Row: {
          banned_by: string
          community_id: string
          created_at: string
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          banned_by: string
          community_id: string
          created_at?: string
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          banned_by?: string
          community_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_bans_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_key_shares: {
        Row: {
          community_id: string
          created_at: string
          encrypted_key: string
          recipient_id: string
          sender_id: string
          sender_public_key: string
        }
        Insert: {
          community_id: string
          created_at?: string
          encrypted_key: string
          recipient_id: string
          sender_id: string
          sender_public_key: string
        }
        Update: {
          community_id?: string
          created_at?: string
          encrypted_key?: string
          recipient_id?: string
          sender_id?: string
          sender_public_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_key_shares_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_members: {
        Row: {
          community_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          community_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          community_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_messages: {
        Row: {
          community_id: string
          content: string
          created_at: string
          deleted: boolean
          id: string
          is_encrypted: boolean
          reply_to: string | null
          reply_to_id: string | null
          reply_to_preview: string | null
          sender_color: string | null
          sender_id: string
          sender_username: string
          user_color: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          community_id: string
          content: string
          created_at?: string
          deleted?: boolean
          id?: string
          is_encrypted?: boolean
          reply_to?: string | null
          reply_to_id?: string | null
          reply_to_preview?: string | null
          sender_color?: string | null
          sender_id: string
          sender_username: string
          user_color?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          community_id?: string
          content?: string
          created_at?: string
          deleted?: boolean
          id?: string
          is_encrypted?: boolean
          reply_to?: string | null
          reply_to_id?: string | null
          reply_to_preview?: string | null
          sender_color?: string | null
          sender_id?: string
          sender_username?: string
          user_color?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_messages_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "community_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      community_mutes: {
        Row: {
          community_id: string
          created_at: string
          id: string
          muted_by: string
          muted_until: string
          user_id: string
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          muted_by: string
          muted_until: string
          user_id: string
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          muted_by?: string
          muted_until?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_mutes_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_rules: {
        Row: {
          community_id: string
          created_at: string
          id: string
          order_index: number
          rule_text: string
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          order_index?: number
          rule_text: string
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          order_index?: number
          rule_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_rules_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_settings: {
        Row: {
          can_send_images: boolean
          can_send_videos: boolean
          can_share_links: boolean
          community_id: string
          posts_need_approval: boolean
          updated_at: string
          who_can_comment: string
          who_can_post: string
        }
        Insert: {
          can_send_images?: boolean
          can_send_videos?: boolean
          can_share_links?: boolean
          community_id: string
          posts_need_approval?: boolean
          updated_at?: string
          who_can_comment?: string
          who_can_post?: string
        }
        Update: {
          can_send_images?: boolean
          can_send_videos?: boolean
          can_share_links?: boolean
          community_id?: string
          posts_need_approval?: boolean
          updated_at?: string
          who_can_comment?: string
          who_can_post?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_settings_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: true
            referencedRelation: "communities"
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
        }
        Insert: {
          created_at?: string
          id?: string
        }
        Update: {
          created_at?: string
          id?: string
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
      friend_requests: {
        Row: {
          created_at: string
          id: string
          receiver_id: string
          sender_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          receiver_id: string
          sender_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: string
        }
        Relationships: []
      }
      library_books: {
        Row: {
          author_id: string
          author_name: string
          category: string
          cover_color: string
          cover_url: string | null
          created_at: string
          description: string
          downloads_count: number
          file_data: string
          file_name: string
          file_size: number
          id: string
          title: string
          uploader_username: string
          views_count: number
        }
        Insert: {
          author_id: string
          author_name: string
          category?: string
          cover_color?: string
          cover_url?: string | null
          created_at?: string
          description?: string
          downloads_count?: number
          file_data: string
          file_name?: string
          file_size?: number
          id?: string
          title: string
          uploader_username?: string
          views_count?: number
        }
        Update: {
          author_id?: string
          author_name?: string
          category?: string
          cover_color?: string
          cover_url?: string | null
          created_at?: string
          description?: string
          downloads_count?: number
          file_data?: string
          file_name?: string
          file_size?: number
          id?: string
          title?: string
          uploader_username?: string
          views_count?: number
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
          media_url: string | null
          message_type: string
          reactions: Json
          receiver_id: string | null
          reply_to: string | null
          sender_id: string
          status: string
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
          media_url?: string | null
          message_type?: string
          reactions?: Json
          receiver_id?: string | null
          reply_to?: string | null
          sender_id: string
          status?: string
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
          media_url?: string | null
          message_type?: string
          reactions?: Json
          receiver_id?: string | null
          reply_to?: string | null
          sender_id?: string
          status?: string
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
          channel_id: string
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
          channel_id: string
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
          channel_id?: string
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
            foreignKeyName: "playlists_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel_stats_view"
            referencedColumns: ["channel_id"]
          },
          {
            foreignKeyName: "playlists_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlists_cover_video_id_fkey"
            columns: ["cover_video_id"]
            isOneToOne: false
            referencedRelation: "videos"
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
          channel_id: string | null
          channel_name: string | null
          clip_end: number | null
          clip_start: number | null
          clip_thumb_url: string | null
          clip_title: string | null
          clip_video_id: string | null
          content: string
          created_at: string
          emoji: string | null
          id: string
          image_url: string | null
          is_ad: boolean
          kind: string | null
          likes_count: number
          music_artist: string | null
          music_cover: string | null
          music_title: string | null
          music_url: string | null
          photo_url: string | null
          photos: string[] | null
          shared_from_post_id: string | null
          video_embed_url: string | null
          video_stream_url: string | null
          video_url: string | null
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
          channel_id?: string | null
          channel_name?: string | null
          clip_end?: number | null
          clip_start?: number | null
          clip_thumb_url?: string | null
          clip_title?: string | null
          clip_video_id?: string | null
          content: string
          created_at?: string
          emoji?: string | null
          id?: string
          image_url?: string | null
          is_ad?: boolean
          kind?: string | null
          likes_count?: number
          music_artist?: string | null
          music_cover?: string | null
          music_title?: string | null
          music_url?: string | null
          photo_url?: string | null
          photos?: string[] | null
          shared_from_post_id?: string | null
          video_embed_url?: string | null
          video_stream_url?: string | null
          video_url?: string | null
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
          channel_id?: string | null
          channel_name?: string | null
          clip_end?: number | null
          clip_start?: number | null
          clip_thumb_url?: string | null
          clip_title?: string | null
          clip_video_id?: string | null
          content?: string
          created_at?: string
          emoji?: string | null
          id?: string
          image_url?: string | null
          is_ad?: boolean
          kind?: string | null
          likes_count?: number
          music_artist?: string | null
          music_cover?: string | null
          music_title?: string | null
          music_url?: string | null
          photo_url?: string | null
          photos?: string[] | null
          shared_from_post_id?: string | null
          video_embed_url?: string | null
          video_stream_url?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel_stats_view"
            referencedColumns: ["channel_id"]
          },
          {
            foreignKeyName: "posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
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
          bio: string | null
          cover_url: string | null
          created_at: string
          e2ee_public_key: string | null
          full_name: string
          hide_last_seen: boolean
          id: string
          is_online: boolean
          is_private: boolean
          last_seen: string | null
          location: string | null
          msg_permission: string
          notification_prefs: Json
          phone_number: string | null
          read_receipts_off: boolean
          updated_at: string
          username: string
          website: string | null
        }
        Insert: {
          age?: number | null
          avatar_color?: string | null
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          e2ee_public_key?: string | null
          full_name: string
          hide_last_seen?: boolean
          id: string
          is_online?: boolean
          is_private?: boolean
          last_seen?: string | null
          location?: string | null
          msg_permission?: string
          notification_prefs?: Json
          phone_number?: string | null
          read_receipts_off?: boolean
          updated_at?: string
          username: string
          website?: string | null
        }
        Update: {
          age?: number | null
          avatar_color?: string | null
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          e2ee_public_key?: string | null
          full_name?: string
          hide_last_seen?: boolean
          id?: string
          is_online?: boolean
          is_private?: boolean
          last_seen?: string | null
          location?: string | null
          msg_permission?: string
          notification_prefs?: Json
          phone_number?: string | null
          read_receipts_off?: boolean
          updated_at?: string
          username?: string
          website?: string | null
        }
        Relationships: []
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
      stories: {
        Row: {
          author_color: string
          author_username: string
          bg_grad: string | null
          created_at: string
          expires_at: string | null
          filter_css: string | null
          id: string
          photo_url: string | null
          story_data: Json
          text: string | null
          user_id: string
        }
        Insert: {
          author_color?: string
          author_username: string
          bg_grad?: string | null
          created_at?: string
          expires_at?: string | null
          filter_css?: string | null
          id?: string
          photo_url?: string | null
          story_data?: Json
          text?: string | null
          user_id: string
        }
        Update: {
          author_color?: string
          author_username?: string
          bg_grad?: string | null
          created_at?: string
          expires_at?: string | null
          filter_css?: string | null
          id?: string
          photo_url?: string | null
          story_data?: Json
          text?: string | null
          user_id?: string
        }
        Relationships: []
      }
      stories_books: {
        Row: {
          author_id: string
          author_username: string
          chapter_count: number
          cover_color: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          author_username?: string
          chapter_count?: number
          cover_color?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          author_username?: string
          chapter_count?: number
          cover_color?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      story_chapters: {
        Row: {
          book_id: string
          chapter_number: number
          content: string
          created_at: string
          id: string
          title: string | null
        }
        Insert: {
          book_id: string
          chapter_number?: number
          content?: string
          created_at?: string
          id?: string
          title?: string | null
        }
        Update: {
          book_id?: string
          chapter_number?: number
          content?: string
          created_at?: string
          id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "stories_books"
            referencedColumns: ["id"]
          },
        ]
      }
      story_message_notifications: {
        Row: {
          created_at: string
          id: string
          message_id: string
          read_at: string | null
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          read_at?: string | null
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          read_at?: string | null
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_message_notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "story_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      story_messages: {
        Row: {
          author_color: string
          author_id: string
          author_username: string
          content: string
          created_at: string
          id: string
          media_url: string | null
          message_type: string
          story_id: string
          updated_at: string
        }
        Insert: {
          author_color?: string
          author_id: string
          author_username: string
          content: string
          created_at?: string
          id?: string
          media_url?: string | null
          message_type?: string
          story_id: string
          updated_at?: string
        }
        Update: {
          author_color?: string
          author_id?: string
          author_username?: string
          content?: string
          created_at?: string
          id?: string
          media_url?: string | null
          message_type?: string
          story_id?: string
          updated_at?: string
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
          channel_id: string
          country: string | null
          country_code: string | null
          id: string
          user_id: string | null
          video_id: string
          viewed_at: string
          viewer_fingerprint: string | null
          viewer_ip: string | null
          watch_pct: number | null
        }
        Insert: {
          channel_id: string
          country?: string | null
          country_code?: string | null
          id?: string
          user_id?: string | null
          video_id: string
          viewed_at?: string
          viewer_fingerprint?: string | null
          viewer_ip?: string | null
          watch_pct?: number | null
        }
        Update: {
          channel_id?: string
          country?: string | null
          country_code?: string | null
          id?: string
          user_id?: string | null
          video_id?: string
          viewed_at?: string
          viewer_fingerprint?: string | null
          viewer_ip?: string | null
          watch_pct?: number | null
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
          channel_id: string
          comments_count: number
          created_at: string
          description: string | null
          duration_seconds: number | null
          file_size: number | null
          id: string
          likes_count: number
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
          channel_id: string
          comments_count?: number
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          id?: string
          likes_count?: number
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
          channel_id?: string
          comments_count?: number
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          id?: string
          likes_count?: number
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
        Relationships: [
          {
            foreignKeyName: "videos_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel_stats_view"
            referencedColumns: ["channel_id"]
          },
          {
            foreignKeyName: "videos_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      channel_stats_view: {
        Row: {
          avg_watch_pct: number | null
          channel_id: string | null
          followers: number | null
          followers_gained_28d: number | null
          published_videos: number | null
          total_duration_seconds: number | null
          total_videos: number | null
          total_views: number | null
          views_24h: number | null
          views_28d: number | null
          views_7d: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_expired_stories: { Args: never; Returns: undefined }
      create_conversation_with_participants: {
        Args: { p_my_id: string; p_other_id: string }
        Returns: string
      }
      get_feed_clips: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          author_color: string
          author_id: string
          author_name: string
          author_username: string
          channel_avatar: string
          channel_handle: string
          channel_id: string
          channel_name: string
          clip_end: number
          clip_start: number
          clip_thumb_url: string
          clip_title: string
          clip_video_id: string
          created_at: string
          id: string
          kind: string
          likes_count: number
          video_embed_url: string
          video_stream_url: string
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
      increment_library_book_counter: {
        Args: { p_book_id: string; p_counter: string }
        Returns: undefined
      }
      is_conversation_participant: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      mark_view_once_opened: {
        Args: { p_msg_id: string; p_user_id: string }
        Returns: undefined
      }
      record_video_view: {
        Args: {
          p_channel_id?: string
          p_country?: string
          p_country_code?: string
          p_video_id: string
          p_viewer_fingerprint?: string
        }
        Returns: Json
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
