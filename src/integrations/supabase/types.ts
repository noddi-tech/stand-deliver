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
      ai_weekly_digests: {
        Row: {
          ai_narrative: string | null
          ai_recommendations: Json | null
          completion_rate: number | null
          created_at: string
          cross_platform_activity: Json | null
          dora_metrics: Json | null
          health_score: number | null
          id: string
          team_id: string
          top_themes: Json | null
          total_blocked: number | null
          total_carried: number | null
          total_commitments: number | null
          total_completed: number | null
          week_end: string
          week_start: string
          weekly_awards: Json | null
          work_distribution: Json | null
        }
        Insert: {
          ai_narrative?: string | null
          ai_recommendations?: Json | null
          completion_rate?: number | null
          created_at?: string
          cross_platform_activity?: Json | null
          dora_metrics?: Json | null
          health_score?: number | null
          id?: string
          team_id: string
          top_themes?: Json | null
          total_blocked?: number | null
          total_carried?: number | null
          total_commitments?: number | null
          total_completed?: number | null
          week_end: string
          week_start: string
          weekly_awards?: Json | null
          work_distribution?: Json | null
        }
        Update: {
          ai_narrative?: string | null
          ai_recommendations?: Json | null
          completion_rate?: number | null
          created_at?: string
          cross_platform_activity?: Json | null
          dora_metrics?: Json | null
          health_score?: number | null
          id?: string
          team_id?: string
          top_themes?: Json | null
          total_blocked?: number | null
          total_carried?: number | null
          total_commitments?: number | null
          total_completed?: number | null
          week_end?: string
          week_start?: string
          weekly_awards?: Json | null
          work_distribution?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_weekly_digests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_definitions: {
        Row: {
          category: string
          criteria: Json
          description: string
          emoji: string
          id: string
          name: string
        }
        Insert: {
          category?: string
          criteria?: Json
          description: string
          emoji: string
          id: string
          name: string
        }
        Update: {
          category?: string
          criteria?: Json
          description?: string
          emoji?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      blockers: {
        Row: {
          category: Database["public"]["Enums"]["blocker_category"]
          commitment_id: string | null
          created_at: string
          days_open: number
          description: string
          id: string
          is_resolved: boolean
          member_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          session_id: string | null
          team_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["blocker_category"]
          commitment_id?: string | null
          created_at?: string
          days_open?: number
          description: string
          id?: string
          is_resolved?: boolean
          member_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          team_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["blocker_category"]
          commitment_id?: string | null
          created_at?: string
          days_open?: number
          description?: string
          id?: string
          is_resolved?: boolean
          member_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blockers_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blockers_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blockers_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blockers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "standup_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blockers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      clickup_installations: {
        Row: {
          api_token_encrypted: string
          clickup_team_id: string
          clickup_team_name: string | null
          id: string
          installed_at: string
          installed_by: string | null
          org_id: string
        }
        Insert: {
          api_token_encrypted: string
          clickup_team_id: string
          clickup_team_name?: string | null
          id?: string
          installed_at?: string
          installed_by?: string | null
          org_id: string
        }
        Update: {
          api_token_encrypted?: string
          clickup_team_id?: string
          clickup_team_name?: string | null
          id?: string
          installed_at?: string
          installed_by?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clickup_installations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clickup_user_mappings: {
        Row: {
          clickup_display_name: string | null
          clickup_member_id: string
          created_at: string
          id: string
          org_id: string
          user_id: string
        }
        Insert: {
          clickup_display_name?: string | null
          clickup_member_id: string
          created_at?: string
          id?: string
          org_id: string
          user_id: string
        }
        Update: {
          clickup_display_name?: string | null
          clickup_member_id?: string
          created_at?: string
          id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clickup_user_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commitment_history: {
        Row: {
          changed_at: string
          commitment_id: string
          id: string
          new_status: string | null
          note: string | null
          old_status: string | null
          session_id: string | null
        }
        Insert: {
          changed_at?: string
          commitment_id: string
          id?: string
          new_status?: string | null
          note?: string | null
          old_status?: string | null
          session_id?: string | null
        }
        Update: {
          changed_at?: string
          commitment_id?: string
          id?: string
          new_status?: string | null
          note?: string | null
          old_status?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commitment_history_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_history_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "standup_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      commitments: {
        Row: {
          blocked_reason: string | null
          carry_count: number
          clickup_task_id: string | null
          created_at: string
          current_session_id: string | null
          description: string | null
          id: string
          member_id: string
          origin_session_id: string | null
          priority: Database["public"]["Enums"]["commitment_priority"]
          resolution_note: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["commitment_status"]
          team_id: string
          title: string
          updated_at: string
        }
        Insert: {
          blocked_reason?: string | null
          carry_count?: number
          clickup_task_id?: string | null
          created_at?: string
          current_session_id?: string | null
          description?: string | null
          id?: string
          member_id: string
          origin_session_id?: string | null
          priority?: Database["public"]["Enums"]["commitment_priority"]
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          team_id: string
          title: string
          updated_at?: string
        }
        Update: {
          blocked_reason?: string | null
          carry_count?: number
          clickup_task_id?: string | null
          created_at?: string
          current_session_id?: string | null
          description?: string | null
          id?: string
          member_id?: string
          origin_session_id?: string | null
          priority?: Database["public"]["Enums"]["commitment_priority"]
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          team_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_current_session_id_fkey"
            columns: ["current_session_id"]
            isOneToOne: false
            referencedRelation: "standup_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_origin_session_id_fkey"
            columns: ["origin_session_id"]
            isOneToOne: false
            referencedRelation: "standup_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      external_activity: {
        Row: {
          activity_type: string
          created_at: string
          external_id: string
          external_url: string | null
          id: string
          is_acknowledged: boolean
          member_id: string
          metadata: Json | null
          occurred_at: string
          source: string
          team_id: string
          title: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          external_id: string
          external_url?: string | null
          id?: string
          is_acknowledged?: boolean
          member_id: string
          metadata?: Json | null
          occurred_at?: string
          source: string
          team_id: string
          title: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          external_id?: string
          external_url?: string | null
          id?: string
          is_acknowledged?: boolean
          member_id?: string
          metadata?: Json | null
          occurred_at?: string
          source?: string
          team_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_activity_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_activity_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      focus_recommendations: {
        Row: {
          created_at: string
          description: string
          id: string
          is_dismissed: boolean
          member_id: string
          priority: string
          recommendation_type: Database["public"]["Enums"]["recommendation_type"]
          session_id: string | null
          team_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_dismissed?: boolean
          member_id: string
          priority?: string
          recommendation_type: Database["public"]["Enums"]["recommendation_type"]
          session_id?: string | null
          team_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_dismissed?: boolean
          member_id?: string
          priority?: string
          recommendation_type?: Database["public"]["Enums"]["recommendation_type"]
          session_id?: string | null
          team_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "focus_recommendations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "focus_recommendations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "standup_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "focus_recommendations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      github_installations: {
        Row: {
          api_token_encrypted: string
          github_org_name: string | null
          id: string
          installed_at: string
          installed_by: string | null
          org_id: string
        }
        Insert: {
          api_token_encrypted: string
          github_org_name?: string | null
          id?: string
          installed_at?: string
          installed_by?: string | null
          org_id: string
        }
        Update: {
          api_token_encrypted?: string
          github_org_name?: string | null
          id?: string
          installed_at?: string
          installed_by?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_installations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      github_user_mappings: {
        Row: {
          created_at: string
          github_display_name: string | null
          github_user_id: number | null
          github_username: string
          id: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          github_display_name?: string | null
          github_user_id?: number | null
          github_username: string
          id?: string
          org_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          github_display_name?: string | null
          github_user_id?: number | null
          github_username?: string
          id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_user_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          member_id: string
          metadata: Json | null
          team_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          member_id: string
          metadata?: Json | null
          team_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          member_id?: string
          metadata?: Json | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badge_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_badges_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_badges_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          notification_type: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slack_workspace_id: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slack_workspace_id?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slack_workspace_id?: string | null
          slug?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          timezone: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          timezone?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          timezone?: string
        }
        Relationships: []
      }
      slack_installations: {
        Row: {
          bot_token: string
          bot_user_id: string | null
          id: string
          installed_at: string
          installing_user_id: string | null
          org_id: string
          workspace_id: string
          workspace_name: string
        }
        Insert: {
          bot_token: string
          bot_user_id?: string | null
          id?: string
          installed_at?: string
          installing_user_id?: string | null
          org_id: string
          workspace_id: string
          workspace_name: string
        }
        Update: {
          bot_token?: string
          bot_user_id?: string | null
          id?: string
          installed_at?: string
          installing_user_id?: string | null
          org_id?: string
          workspace_id?: string
          workspace_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "slack_installations_installing_user_id_fkey"
            columns: ["installing_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_installations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_invites: {
        Row: {
          created_at: string
          id: string
          invited_by: string
          org_id: string
          slack_display_name: string | null
          slack_user_id: string
          status: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by: string
          org_id: string
          slack_display_name?: string | null
          slack_user_id: string
          status?: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          slack_display_name?: string | null
          slack_user_id?: string
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slack_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_oauth_states: {
        Row: {
          created_at: string
          id: string
          nonce: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nonce: string
          org_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nonce?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slack_oauth_states_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_user_mappings: {
        Row: {
          created_at: string
          id: string
          org_id: string
          slack_display_name: string | null
          slack_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          slack_display_name?: string | null
          slack_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          slack_display_name?: string | null
          slack_user_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slack_user_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_user_mappings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      standup_responses: {
        Row: {
          blockers_text: string | null
          duration_seconds: number | null
          id: string
          member_id: string
          mood: Database["public"]["Enums"]["mood_type"] | null
          notes: string | null
          session_id: string
          submitted_at: string
          submitted_via: Database["public"]["Enums"]["submission_via"]
          today_text: string | null
          yesterday_text: string | null
        }
        Insert: {
          blockers_text?: string | null
          duration_seconds?: number | null
          id?: string
          member_id: string
          mood?: Database["public"]["Enums"]["mood_type"] | null
          notes?: string | null
          session_id: string
          submitted_at?: string
          submitted_via?: Database["public"]["Enums"]["submission_via"]
          today_text?: string | null
          yesterday_text?: string | null
        }
        Update: {
          blockers_text?: string | null
          duration_seconds?: number | null
          id?: string
          member_id?: string
          mood?: Database["public"]["Enums"]["mood_type"] | null
          notes?: string | null
          session_id?: string
          submitted_at?: string
          submitted_via?: Database["public"]["Enums"]["submission_via"]
          today_text?: string | null
          yesterday_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "standup_responses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standup_responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "standup_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      standup_sessions: {
        Row: {
          ai_insights: Json | null
          ai_summary: string | null
          completed_at: string | null
          created_at: string
          id: string
          session_date: string
          session_type: Database["public"]["Enums"]["session_type"]
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
          team_id: string
        }
        Insert: {
          ai_insights?: Json | null
          ai_summary?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          session_date: string
          session_type?: Database["public"]["Enums"]["session_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          team_id: string
        }
        Update: {
          ai_insights?: Json | null
          ai_summary?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          session_date?: string
          session_type?: Database["public"]["Enums"]["session_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "standup_sessions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["team_role"]
          slack_user_id: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["team_role"]
          slack_user_id?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["team_role"]
          slack_user_id?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          slack_channel_id: string | null
          standup_days: string[]
          standup_time: string
          standup_timezone: string
          timer_seconds_per_person: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          slack_channel_id?: string | null
          standup_days?: string[]
          standup_time?: string
          standup_timezone?: string
          timer_seconds_per_person?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          slack_channel_id?: string | null
          standup_days?: string[]
          standup_time?: string
          standup_timezone?: string
          timer_seconds_per_person?: number
        }
        Relationships: [
          {
            foreignKeyName: "teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      carry_forward_commitments:
        | { Args: { p_session_id: string; p_team_id: string }; Returns: number }
        | {
            Args: {
              p_member_id?: string
              p_session_id: string
              p_team_id: string
            }
            Returns: number
          }
      create_org_and_join: {
        Args: { p_name: string; p_slack_workspace_id?: string; p_slug: string }
        Returns: Json
      }
      get_team_org: { Args: { _team_id: string }; Returns: string }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_lead: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      blocker_category:
        | "dependency"
        | "technical"
        | "external"
        | "resource"
        | "unclear_requirements"
        | "other"
      commitment_priority: "high" | "medium" | "low"
      commitment_status:
        | "active"
        | "done"
        | "in_progress"
        | "blocked"
        | "dropped"
        | "carried"
      mood_type: "great" | "good" | "okay" | "struggling" | "rough"
      org_role: "owner" | "admin" | "member"
      recommendation_type:
        | "focus_suggestion"
        | "blocker_alert"
        | "carry_over_warning"
        | "workload_balance"
        | "pattern_insight"
        | "celebration"
      session_status: "scheduled" | "collecting" | "in_progress" | "completed"
      session_type: "async" | "sync" | "physical"
      submission_via: "web" | "slack" | "physical"
      team_role: "lead" | "member"
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
      blocker_category: [
        "dependency",
        "technical",
        "external",
        "resource",
        "unclear_requirements",
        "other",
      ],
      commitment_priority: ["high", "medium", "low"],
      commitment_status: [
        "active",
        "done",
        "in_progress",
        "blocked",
        "dropped",
        "carried",
      ],
      mood_type: ["great", "good", "okay", "struggling", "rough"],
      org_role: ["owner", "admin", "member"],
      recommendation_type: [
        "focus_suggestion",
        "blocker_alert",
        "carry_over_warning",
        "workload_balance",
        "pattern_insight",
        "celebration",
      ],
      session_status: ["scheduled", "collecting", "in_progress", "completed"],
      session_type: ["async", "sync", "physical"],
      submission_via: ["web", "slack", "physical"],
      team_role: ["lead", "member"],
    },
  },
} as const
