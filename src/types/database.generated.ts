export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      attendance_breaks: {
        Row: {
          classified_at: string | null;
          classified_by: string | null;
          created_at: string;
          duration_seconds: number | null;
          end_time: string | null;
          id: number;
          location_id: string;
          organization_id: string;
          pay_classification: Database["public"]["Enums"]["attendance_break_pay_classification"];
          profile_id: string;
          session_id: string;
          start_time: string;
        };
        Insert: {
          classified_at?: string | null;
          classified_by?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          end_time?: string | null;
          id?: never;
          location_id: string;
          organization_id: string;
          pay_classification?: Database["public"]["Enums"]["attendance_break_pay_classification"];
          profile_id: string;
          session_id: string;
          start_time?: string;
        };
        Update: {
          classified_at?: string | null;
          classified_by?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          end_time?: string | null;
          id?: never;
          location_id?: string;
          organization_id?: string;
          pay_classification?: Database["public"]["Enums"]["attendance_break_pay_classification"];
          profile_id?: string;
          session_id?: string;
          start_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_breaks_classified_by_fkey";
            columns: ["classified_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_breaks_session_tenant_fk";
            columns: [
              "session_id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
            isOneToOne: false;
            referencedRelation: "attendance_session_summaries";
            referencedColumns: [
              "session_id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
          },
          {
            foreignKeyName: "attendance_breaks_session_tenant_fk";
            columns: [
              "session_id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
            isOneToOne: false;
            referencedRelation: "attendance_sessions";
            referencedColumns: [
              "id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
          },
        ];
      };
      attendance_events: {
        Row: {
          actor_profile_id: string;
          correction_reason: string | null;
          created_at: string;
          event_time: string;
          event_type: Database["public"]["Enums"]["attendance_event_type"];
          id: number;
          idempotency_key: string | null;
          is_manager_correction: boolean;
          location_id: string;
          metadata: Json;
          organization_id: string;
          profile_id: string;
          reverses_event_id: number | null;
          service_date: string;
          session_id: string;
          source: Database["public"]["Enums"]["attendance_event_source"];
        };
        Insert: {
          actor_profile_id: string;
          correction_reason?: string | null;
          created_at?: string;
          event_time?: string;
          event_type: Database["public"]["Enums"]["attendance_event_type"];
          id?: never;
          idempotency_key?: string | null;
          is_manager_correction?: boolean;
          location_id: string;
          metadata?: Json;
          organization_id: string;
          profile_id: string;
          reverses_event_id?: number | null;
          service_date: string;
          session_id: string;
          source?: Database["public"]["Enums"]["attendance_event_source"];
        };
        Update: {
          actor_profile_id?: string;
          correction_reason?: string | null;
          created_at?: string;
          event_time?: string;
          event_type?: Database["public"]["Enums"]["attendance_event_type"];
          id?: never;
          idempotency_key?: string | null;
          is_manager_correction?: boolean;
          location_id?: string;
          metadata?: Json;
          organization_id?: string;
          profile_id?: string;
          reverses_event_id?: number | null;
          service_date?: string;
          session_id?: string;
          source?: Database["public"]["Enums"]["attendance_event_source"];
        };
        Relationships: [
          {
            foreignKeyName: "attendance_events_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_events_reverses_event_id_fkey";
            columns: ["reverses_event_id"];
            isOneToOne: false;
            referencedRelation: "attendance_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_events_session_tenant_fk";
            columns: [
              "session_id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
            isOneToOne: false;
            referencedRelation: "attendance_session_summaries";
            referencedColumns: [
              "session_id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
          },
          {
            foreignKeyName: "attendance_events_session_tenant_fk";
            columns: [
              "session_id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
            isOneToOne: false;
            referencedRelation: "attendance_sessions";
            referencedColumns: [
              "id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
          },
        ];
      };
      attendance_financial_activation: {
        Row: {
          enabled: boolean;
          evidence: string | null;
          singleton: boolean;
          updated_at: string;
        };
        Insert: {
          enabled?: boolean;
          evidence?: string | null;
          singleton?: boolean;
          updated_at?: string;
        };
        Update: {
          enabled?: boolean;
          evidence?: string | null;
          singleton?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      attendance_identity_links: {
        Row: {
          id: number;
          linked_at: string;
          linked_by: string;
          neon_user_id: number;
          organization_id: string;
          profile_id: string;
        };
        Insert: {
          id?: never;
          linked_at?: string;
          linked_by: string;
          neon_user_id: number;
          organization_id: string;
          profile_id: string;
        };
        Update: {
          id?: never;
          linked_at?: string;
          linked_by?: string;
          neon_user_id?: number;
          organization_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_identity_links_linked_by_member_fk";
            columns: ["organization_id", "linked_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "attendance_identity_links_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_identity_links_profile_member_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: true;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      attendance_sessions: {
        Row: {
          clock_in_at: string;
          clock_out_at: string | null;
          correction_count: number;
          created_at: string;
          created_by: string;
          gross_elapsed_seconds: number | null;
          id: string;
          last_corrected_at: string | null;
          location_id: string;
          organization_id: string;
          profile_id: string;
          service_date: string;
          status: Database["public"]["Enums"]["attendance_session_status"];
          total_break_seconds: number;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          clock_in_at?: string;
          clock_out_at?: string | null;
          correction_count?: number;
          created_at?: string;
          created_by: string;
          gross_elapsed_seconds?: number | null;
          id?: string;
          last_corrected_at?: string | null;
          location_id: string;
          organization_id: string;
          profile_id: string;
          service_date: string;
          status?: Database["public"]["Enums"]["attendance_session_status"];
          total_break_seconds?: number;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          clock_in_at?: string;
          clock_out_at?: string | null;
          correction_count?: number;
          created_at?: string;
          created_by?: string;
          gross_elapsed_seconds?: number | null;
          id?: string;
          last_corrected_at?: string | null;
          location_id?: string;
          organization_id?: string;
          profile_id?: string;
          service_date?: string;
          status?: Database["public"]["Enums"]["attendance_session_status"];
          total_break_seconds?: number;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_sessions_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "attendance_sessions_membership_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "attendance_sessions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_sessions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_sessions_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_profile_id: string | null;
          after_state: Json | null;
          before_state: Json | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: number;
          location_id: string | null;
          organization_id: string;
          reason: string | null;
        };
        Insert: {
          action: string;
          actor_profile_id?: string | null;
          after_state?: Json | null;
          before_state?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
          location_id?: string | null;
          organization_id: string;
          reason?: string | null;
        };
        Update: {
          action?: string;
          actor_profile_id?: string | null;
          after_state?: Json | null;
          before_state?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
          location_id?: string | null;
          organization_id?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "audit_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      availability_rules: {
        Row: {
          available_from: string;
          available_until: string;
          created_at: string;
          day_of_week: number;
          effective_from: string;
          effective_until: string | null;
          id: number;
          organization_id: string;
          profile_id: string;
        };
        Insert: {
          available_from: string;
          available_until: string;
          created_at?: string;
          day_of_week: number;
          effective_from?: string;
          effective_until?: string | null;
          id?: never;
          organization_id: string;
          profile_id: string;
        };
        Update: {
          available_from?: string;
          available_until?: string;
          created_at?: string;
          day_of_week?: number;
          effective_from?: string;
          effective_until?: string | null;
          id?: never;
          organization_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "availability_member_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "availability_rules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "availability_rules_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bar_recipe_categories: {
        Row: {
          created_at: string;
          created_by: string;
          display_order: number;
          id: string;
          is_active: boolean;
          is_fallback: boolean;
          name: string;
          organization_id: string;
          slug: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          is_fallback?: boolean;
          name: string;
          organization_id: string;
          slug: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          is_fallback?: boolean;
          name?: string;
          organization_id?: string;
          slug?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "bar_recipe_categories_creator_fk";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bar_recipe_categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bar_recipe_categories_updater_fk";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bar_recipe_garnishes: {
        Row: {
          id: string;
          name: string;
          notes: string | null;
          organization_id: string;
          sort_order: number;
          variant_id: string;
        };
        Insert: {
          id?: string;
          name: string;
          notes?: string | null;
          organization_id: string;
          sort_order: number;
          variant_id: string;
        };
        Update: {
          id?: string;
          name?: string;
          notes?: string | null;
          organization_id?: string;
          sort_order?: number;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bar_recipe_garnishes_variant_fk";
            columns: ["variant_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bar_recipe_variants";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      bar_recipe_ingredients: {
        Row: {
          amount: string | null;
          id: string;
          ingredient_name: string;
          organization_id: string;
          preparation: string | null;
          sort_order: number;
          unit: string | null;
          variant_id: string;
        };
        Insert: {
          amount?: string | null;
          id?: string;
          ingredient_name: string;
          organization_id: string;
          preparation?: string | null;
          sort_order: number;
          unit?: string | null;
          variant_id: string;
        };
        Update: {
          amount?: string | null;
          id?: string;
          ingredient_name?: string;
          organization_id?: string;
          preparation?: string | null;
          sort_order?: number;
          unit?: string | null;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bar_recipe_ingredients_variant_fk";
            columns: ["variant_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bar_recipe_variants";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      bar_recipe_steps: {
        Row: {
          id: string;
          instruction: string;
          organization_id: string;
          sort_order: number;
          variant_id: string;
        };
        Insert: {
          id?: string;
          instruction: string;
          organization_id: string;
          sort_order: number;
          variant_id: string;
        };
        Update: {
          id?: string;
          instruction?: string;
          organization_id?: string;
          sort_order?: number;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bar_recipe_steps_variant_fk";
            columns: ["variant_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bar_recipe_variants";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      bar_recipe_variants: {
        Row: {
          batch_notes: string | null;
          created_at: string;
          glass: string | null;
          glass_notes: string | null;
          id: string;
          method: string | null;
          organization_id: string;
          presentation_notes: string | null;
          recipe_id: string;
          rim_notes: string | null;
          rim_type: string | null;
          tips: string | null;
          updated_at: string;
          variant: string;
        };
        Insert: {
          batch_notes?: string | null;
          created_at?: string;
          glass?: string | null;
          glass_notes?: string | null;
          id?: string;
          method?: string | null;
          organization_id: string;
          presentation_notes?: string | null;
          recipe_id: string;
          rim_notes?: string | null;
          rim_type?: string | null;
          tips?: string | null;
          updated_at?: string;
          variant: string;
        };
        Update: {
          batch_notes?: string | null;
          created_at?: string;
          glass?: string | null;
          glass_notes?: string | null;
          id?: string;
          method?: string | null;
          organization_id?: string;
          presentation_notes?: string | null;
          recipe_id?: string;
          rim_notes?: string | null;
          rim_type?: string | null;
          tips?: string | null;
          updated_at?: string;
          variant?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bar_recipe_variants_recipe_fk";
            columns: ["recipe_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bar_recipes";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      bar_recipes: {
        Row: {
          alternate_name: string | null;
          archived_at: string | null;
          archived_by: string | null;
          base_spirit: string | null;
          category_id: string;
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          image_path: string | null;
          image_thumb_path: string | null;
          is_active: boolean;
          is_alcoholic: boolean;
          is_menu_item: boolean;
          is_popular: boolean;
          name: string;
          organization_id: string;
          recipe_number: number;
          slug: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          alternate_name?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          base_spirit?: string | null;
          category_id: string;
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          image_path?: string | null;
          image_thumb_path?: string | null;
          is_active?: boolean;
          is_alcoholic?: boolean;
          is_menu_item?: boolean;
          is_popular?: boolean;
          name: string;
          organization_id: string;
          recipe_number: number;
          slug: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          alternate_name?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          base_spirit?: string | null;
          category_id?: string;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          image_path?: string | null;
          image_thumb_path?: string | null;
          is_active?: boolean;
          is_alcoholic?: boolean;
          is_menu_item?: boolean;
          is_popular?: boolean;
          name?: string;
          organization_id?: string;
          recipe_number?: number;
          slug?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "bar_recipes_archiver_fk";
            columns: ["archived_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bar_recipes_category_fk";
            columns: ["category_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bar_recipe_categories";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "bar_recipes_creator_fk";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bar_recipes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bar_recipes_updater_fk";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      board_events: {
        Row: {
          actor_profile_id: string;
          created_at: string;
          event_type: Database["public"]["Enums"]["board_event_type"];
          id: number;
          inverse_payload: Json;
          organization_id: string;
          payload: Json;
          service_session_id: number;
          undone_at: string | null;
        };
        Insert: {
          actor_profile_id: string;
          created_at?: string;
          event_type: Database["public"]["Enums"]["board_event_type"];
          id?: never;
          inverse_payload?: Json;
          organization_id: string;
          payload?: Json;
          service_session_id: number;
          undone_at?: string | null;
        };
        Update: {
          actor_profile_id?: string;
          created_at?: string;
          event_type?: Database["public"]["Enums"]["board_event_type"];
          id?: never;
          inverse_payload?: Json;
          organization_id?: string;
          payload?: Json;
          service_session_id?: number;
          undone_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "board_events_actor_profile_fk";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "board_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "board_events_service_session_id_organization_id_fkey";
            columns: ["service_session_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      checklist_instances: {
        Row: {
          generated_at: string;
          generated_by: string | null;
          id: string;
          kind: Database["public"]["Enums"]["checklist_kind"];
          location_id: string;
          name: string;
          organization_id: string;
          service_date: string;
          template_id: string;
        };
        Insert: {
          generated_at?: string;
          generated_by?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["checklist_kind"];
          location_id: string;
          name: string;
          organization_id: string;
          service_date: string;
          template_id: string;
        };
        Update: {
          generated_at?: string;
          generated_by?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["checklist_kind"];
          location_id?: string;
          name?: string;
          organization_id?: string;
          service_date?: string;
          template_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checklist_instances_generated_by_profile_fk";
            columns: ["generated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checklist_instances_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checklist_instances_template_fk";
            columns: ["template_id", "organization_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "checklist_templates";
            referencedColumns: ["id", "organization_id", "location_id"];
          },
        ];
      };
      checklist_template_item_assignees: {
        Row: {
          item_id: string;
          organization_id: string;
          profile_id: string;
        };
        Insert: {
          item_id: string;
          organization_id: string;
          profile_id: string;
        };
        Update: {
          item_id?: string;
          organization_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checklist_template_item_assignees_item_fk";
            columns: ["item_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "checklist_template_items";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "checklist_template_item_assignees_member_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      checklist_template_items: {
        Row: {
          active: boolean;
          assignment_mode: Database["public"]["Enums"]["task_assignment_mode"];
          category: string;
          created_at: string;
          due_time: string | null;
          due_window: Database["public"]["Enums"]["task_due_window"] | null;
          id: string;
          instructions: string | null;
          organization_id: string;
          priority: Database["public"]["Enums"]["task_priority"];
          sort_order: number;
          template_id: string;
          title: string;
        };
        Insert: {
          active?: boolean;
          assignment_mode?: Database["public"]["Enums"]["task_assignment_mode"];
          category?: string;
          created_at?: string;
          due_time?: string | null;
          due_window?: Database["public"]["Enums"]["task_due_window"] | null;
          id?: string;
          instructions?: string | null;
          organization_id: string;
          priority?: Database["public"]["Enums"]["task_priority"];
          sort_order?: number;
          template_id: string;
          title: string;
        };
        Update: {
          active?: boolean;
          assignment_mode?: Database["public"]["Enums"]["task_assignment_mode"];
          category?: string;
          created_at?: string;
          due_time?: string | null;
          due_window?: Database["public"]["Enums"]["task_due_window"] | null;
          id?: string;
          instructions?: string | null;
          organization_id?: string;
          priority?: Database["public"]["Enums"]["task_priority"];
          sort_order?: number;
          template_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_category_fkey";
            columns: ["category"];
            isOneToOne: false;
            referencedRelation: "task_categories";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "checklist_template_items_template_fk";
            columns: ["template_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "checklist_templates";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      checklist_templates: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string;
          days_of_week: number[];
          id: string;
          kind: Database["public"]["Enums"]["checklist_kind"];
          location_id: string;
          name: string;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by: string;
          days_of_week?: number[];
          id?: string;
          kind: Database["public"]["Enums"]["checklist_kind"];
          location_id: string;
          name: string;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string;
          days_of_week?: number[];
          id?: string;
          kind?: Database["public"]["Enums"]["checklist_kind"];
          location_id?: string;
          name?: string;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "checklist_templates_created_by_profile_fk";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checklist_templates_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "checklist_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checklist_templates_updated_by_profile_fk";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      dining_areas: {
        Row: {
          area_order: number;
          created_at: string;
          id: number;
          location_id: string;
          name: string;
          organization_id: string;
        };
        Insert: {
          area_order?: number;
          created_at?: string;
          id?: never;
          location_id: string;
          name: string;
          organization_id: string;
        };
        Update: {
          area_order?: number;
          created_at?: string;
          id?: never;
          location_id?: string;
          name?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dining_areas_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dining_areas_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "dining_areas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      dining_tables: {
        Row: {
          active: boolean;
          combinable_group: string | null;
          created_at: string;
          dining_area_id: number;
          id: number;
          label: string;
          location_id: string;
          organization_id: string;
          position_x: number | null;
          position_y: number | null;
          seat_count: number;
          sequence: number;
        };
        Insert: {
          active?: boolean;
          combinable_group?: string | null;
          created_at?: string;
          dining_area_id: number;
          id?: never;
          label: string;
          location_id: string;
          organization_id: string;
          position_x?: number | null;
          position_y?: number | null;
          seat_count: number;
          sequence?: number;
        };
        Update: {
          active?: boolean;
          combinable_group?: string | null;
          created_at?: string;
          dining_area_id?: number;
          id?: never;
          label?: string;
          location_id?: string;
          organization_id?: string;
          position_x?: number | null;
          position_y?: number | null;
          seat_count?: number;
          sequence?: number;
        };
        Relationships: [
          {
            foreignKeyName: "dining_tables_area_tenant_fk";
            columns: ["dining_area_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "dining_areas";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "dining_tables_dining_area_id_fkey";
            columns: ["dining_area_id"];
            isOneToOne: false;
            referencedRelation: "dining_areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dining_tables_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dining_tables_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "dining_tables_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      floor_templates: {
        Row: {
          assignments: Json;
          created_at: string;
          id: number;
          location_id: string;
          meal_period: string;
          name: string;
          organization_id: string;
          server_count: number;
        };
        Insert: {
          assignments?: Json;
          created_at?: string;
          id?: never;
          location_id: string;
          meal_period: string;
          name: string;
          organization_id: string;
          server_count: number;
        };
        Update: {
          assignments?: Json;
          created_at?: string;
          id?: never;
          location_id?: string;
          meal_period?: string;
          name?: string;
          organization_id?: string;
          server_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "floor_templates_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "floor_templates_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "floor_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_adjustments: {
        Row: {
          actor_profile_id: string;
          created_at: string;
          cutoff_at_time: number | null;
          delta_backup: number | null;
          delta_on_hand: number | null;
          delta_total: number | null;
          id: number;
          import_batch_id: string | null;
          location_id: string;
          new_backup: number;
          new_on_hand: number;
          note: string | null;
          organization_id: string;
          prev_backup: number;
          prev_on_hand: number;
          product_id: string;
          reason: string;
          source: string;
          status_after: string;
          stock_version_after: number;
        };
        Insert: {
          actor_profile_id: string;
          created_at?: string;
          cutoff_at_time?: number | null;
          delta_backup?: number | null;
          delta_on_hand?: number | null;
          delta_total?: number | null;
          id?: never;
          import_batch_id?: string | null;
          location_id: string;
          new_backup: number;
          new_on_hand: number;
          note?: string | null;
          organization_id: string;
          prev_backup: number;
          prev_on_hand: number;
          product_id: string;
          reason: string;
          source: string;
          status_after: string;
          stock_version_after: number;
        };
        Update: {
          actor_profile_id?: string;
          created_at?: string;
          cutoff_at_time?: number | null;
          delta_backup?: number | null;
          delta_on_hand?: number | null;
          delta_total?: number | null;
          id?: never;
          import_batch_id?: string | null;
          location_id?: string;
          new_backup?: number;
          new_on_hand?: number;
          note?: string | null;
          organization_id?: string;
          prev_backup?: number;
          prev_on_hand?: number;
          product_id?: string;
          reason?: string;
          source?: string;
          status_after?: string;
          stock_version_after?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_actor_fk";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_adjustments_import_batch_fk";
            columns: ["import_batch_id"];
            isOneToOne: false;
            referencedRelation: "inventory_import_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_adjustments_location_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_adjustments_product_fk";
            columns: ["product_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_products";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      inventory_categories: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          name_key: string;
          organization_id: string;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          name_key?: string;
          organization_id: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          name_key?: string;
          organization_id?: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_categories_creator_fk";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_categories_updater_fk";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_change_log: {
        Row: {
          action: string;
          actor_profile_id: string;
          created_at: string;
          diff: Json;
          entity_id: string | null;
          entity_type: string;
          id: number;
          location_id: string | null;
          organization_id: string;
        };
        Insert: {
          action: string;
          actor_profile_id: string;
          created_at?: string;
          diff?: Json;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
          location_id?: string | null;
          organization_id: string;
        };
        Update: {
          action?: string;
          actor_profile_id?: string;
          created_at?: string;
          diff?: Json;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
          location_id?: string | null;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_change_log_actor_fk";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_change_log_location_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_change_log_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_date_group_imports: {
        Row: {
          actor_profile_id: string;
          created_at: string;
          created_count: number;
          filename: string;
          id: string;
          location_id: string;
          organization_id: string;
          payload_hash: string;
          rejected_count: number;
          request_id: string;
          result: Json;
          skipped_count: number;
          updated_count: number;
        };
        Insert: {
          actor_profile_id: string;
          created_at?: string;
          created_count: number;
          filename: string;
          id?: string;
          location_id: string;
          organization_id: string;
          payload_hash: string;
          rejected_count: number;
          request_id: string;
          result: Json;
          skipped_count: number;
          updated_count: number;
        };
        Update: {
          actor_profile_id?: string;
          created_at?: string;
          created_count?: number;
          filename?: string;
          id?: string;
          location_id?: string;
          organization_id?: string;
          payload_hash?: string;
          rejected_count?: number;
          request_id?: string;
          result?: Json;
          skipped_count?: number;
          updated_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_date_group_imports_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_date_group_imports_location_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_date_group_imports_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_date_lots: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string;
          expiration_date: string | null;
          expiration_precision: string | null;
          id: string;
          location_id: string;
          manufacture_date: string | null;
          manufacture_precision: string | null;
          notes: string | null;
          organization_id: string;
          product_id: string;
          quantity: number | null;
          updated_at: string;
          updated_by: string;
          version: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by: string;
          expiration_date?: string | null;
          expiration_precision?: string | null;
          id?: string;
          location_id: string;
          manufacture_date?: string | null;
          manufacture_precision?: string | null;
          notes?: string | null;
          organization_id: string;
          product_id: string;
          quantity?: number | null;
          updated_at?: string;
          updated_by: string;
          version?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string;
          expiration_date?: string | null;
          expiration_precision?: string | null;
          id?: string;
          location_id?: string;
          manufacture_date?: string | null;
          manufacture_precision?: string | null;
          notes?: string | null;
          organization_id?: string;
          product_id?: string;
          quantity?: number | null;
          updated_at?: string;
          updated_by?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_date_lots_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_date_lots_location_id_organization_id_fkey";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_date_lots_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_date_lots_product_id_organization_id_fkey";
            columns: ["product_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_products";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_date_lots_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_freshness_rules: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string;
          id: string;
          location_id: string;
          maximum_months: number;
          organization_id: string;
          subcategory_id: string;
          tracking_enabled: boolean;
          updated_at: string;
          updated_by: string;
          version: number;
          warning_months: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by: string;
          id?: string;
          location_id: string;
          maximum_months: number;
          organization_id: string;
          subcategory_id: string;
          tracking_enabled?: boolean;
          updated_at?: string;
          updated_by: string;
          version?: number;
          warning_months: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string;
          id?: string;
          location_id?: string;
          maximum_months?: number;
          organization_id?: string;
          subcategory_id?: string;
          tracking_enabled?: boolean;
          updated_at?: string;
          updated_by?: string;
          version?: number;
          warning_months?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_freshness_rules_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_freshness_rules_location_id_organization_id_fkey";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_freshness_rules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_freshness_rules_subcategory_id_organization_id_fkey";
            columns: ["subcategory_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_subcategories";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_freshness_rules_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_import_batches: {
        Row: {
          actor_profile_id: string;
          categories_created: number;
          committed_at: string | null;
          created_at: string;
          created_count: number;
          error_count: number;
          filename: string;
          format: string;
          id: string;
          location_id: string;
          organization_id: string;
          reason: string;
          request_id: string;
          result: Json | null;
          rows_in_file: number;
          sheet: string | null;
          skipped_count: number;
          staged_plan: Json;
          status: string;
          subcategories_created: number;
          updated_count: number;
          vendors_created: number;
        };
        Insert: {
          actor_profile_id: string;
          categories_created?: number;
          committed_at?: string | null;
          created_at?: string;
          created_count?: number;
          error_count?: number;
          filename: string;
          format: string;
          id?: string;
          location_id: string;
          organization_id: string;
          reason: string;
          request_id: string;
          result?: Json | null;
          rows_in_file?: number;
          sheet?: string | null;
          skipped_count?: number;
          staged_plan: Json;
          status?: string;
          subcategories_created?: number;
          updated_count?: number;
          vendors_created?: number;
        };
        Update: {
          actor_profile_id?: string;
          categories_created?: number;
          committed_at?: string | null;
          created_at?: string;
          created_count?: number;
          error_count?: number;
          filename?: string;
          format?: string;
          id?: string;
          location_id?: string;
          organization_id?: string;
          reason?: string;
          request_id?: string;
          result?: Json | null;
          rows_in_file?: number;
          sheet?: string | null;
          skipped_count?: number;
          staged_plan?: Json;
          status?: string;
          subcategories_created?: number;
          updated_count?: number;
          vendors_created?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_import_batches_actor_fk";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_import_batches_location_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_import_batches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_order_draft_items: {
        Row: {
          created_at: string;
          draft_id: string;
          id: string;
          included: boolean;
          item_note: string | null;
          location_id: string;
          order_qty: number | null;
          organization_id: string;
          par_at_snapshot: number | null;
          product_id: string;
          product_name: string;
          size: string | null;
          sku: string | null;
          status_at_snapshot: string;
          suggested_qty: number | null;
          total_at_snapshot: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          draft_id: string;
          id?: string;
          included?: boolean;
          item_note?: string | null;
          location_id: string;
          order_qty?: number | null;
          organization_id: string;
          par_at_snapshot?: number | null;
          product_id: string;
          product_name: string;
          size?: string | null;
          sku?: string | null;
          status_at_snapshot: string;
          suggested_qty?: number | null;
          total_at_snapshot: number;
          unit: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          draft_id?: string;
          id?: string;
          included?: boolean;
          item_note?: string | null;
          location_id?: string;
          order_qty?: number | null;
          organization_id?: string;
          par_at_snapshot?: number | null;
          product_id?: string;
          product_name?: string;
          size?: string | null;
          sku?: string | null;
          status_at_snapshot?: string;
          suggested_qty?: number | null;
          total_at_snapshot?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_order_draft_items_draft_fk";
            columns: ["draft_id", "organization_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "inventory_order_drafts";
            referencedColumns: ["id", "organization_id", "location_id"];
          },
          {
            foreignKeyName: "inventory_order_draft_items_product_fk";
            columns: ["product_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_products";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      inventory_order_drafts: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          location_id: string;
          organization_id: string;
          sent_at: string | null;
          sent_by: string | null;
          status: string;
          updated_at: string;
          updated_by: string;
          vendor_id: string;
          vendor_name: string;
          vendor_note: string | null;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          location_id: string;
          organization_id: string;
          sent_at?: string | null;
          sent_by?: string | null;
          status?: string;
          updated_at?: string;
          updated_by: string;
          vendor_id: string;
          vendor_name: string;
          vendor_note?: string | null;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          location_id?: string;
          organization_id?: string;
          sent_at?: string | null;
          sent_by?: string | null;
          status?: string;
          updated_at?: string;
          updated_by?: string;
          vendor_id?: string;
          vendor_name?: string;
          vendor_note?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_order_drafts_creator_fk";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_order_drafts_location_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_order_drafts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_order_drafts_sender_fk";
            columns: ["sent_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_order_drafts_updater_fk";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_order_drafts_vendor_fk";
            columns: ["vendor_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_vendors";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      inventory_products: {
        Row: {
          active: boolean;
          archived_at: string | null;
          category_id: string | null;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          name_key: string;
          notes: string | null;
          organization_id: string;
          size: string | null;
          size_key: string;
          sku: string | null;
          sku_key: string | null;
          subcategory_id: string | null;
          unit_key: string;
          unit_label: string | null;
          unit_type: string;
          updated_at: string;
          updated_by: string | null;
          vendor_id: string;
          version: number;
        };
        Insert: {
          active?: boolean;
          archived_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          name_key?: string;
          notes?: string | null;
          organization_id: string;
          size?: string | null;
          size_key?: string;
          sku?: string | null;
          sku_key?: string | null;
          subcategory_id?: string | null;
          unit_key?: string;
          unit_label?: string | null;
          unit_type: string;
          updated_at?: string;
          updated_by?: string | null;
          vendor_id: string;
          version?: number;
        };
        Update: {
          active?: boolean;
          archived_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          name_key?: string;
          notes?: string | null;
          organization_id?: string;
          size?: string | null;
          size_key?: string;
          sku?: string | null;
          sku_key?: string | null;
          subcategory_id?: string | null;
          unit_key?: string;
          unit_label?: string | null;
          unit_type?: string;
          updated_at?: string;
          updated_by?: string | null;
          vendor_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_products_category_fk";
            columns: ["category_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_categories";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_products_creator_fk";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_products_subcategory_fk";
            columns: ["subcategory_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "inventory_subcategories";
            referencedColumns: ["id", "category_id"];
          },
          {
            foreignKeyName: "inventory_products_updater_fk";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_products_vendor_fk";
            columns: ["vendor_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_vendors";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      inventory_saved_views: {
        Row: {
          created_at: string;
          id: string;
          is_default: boolean;
          location_id: string;
          name: string;
          name_key: string | null;
          organization_id: string;
          payload: Json;
          profile_id: string;
          table_key: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          location_id: string;
          name: string;
          name_key?: string | null;
          organization_id: string;
          payload: Json;
          profile_id: string;
          table_key?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          location_id?: string;
          name?: string;
          name_key?: string | null;
          organization_id?: string;
          payload?: Json;
          profile_id?: string;
          table_key?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_saved_views_location_id_organization_id_fkey";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_saved_views_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_saved_views_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_stock: {
        Row: {
          backup: number;
          created_at: string;
          cutoff: number | null;
          last_adjusted_at: string | null;
          location_id: string;
          on_hand: number;
          organization_id: string;
          par: number | null;
          product_id: string;
          total: number | null;
          updated_at: string;
          updated_by: string | null;
          version: number;
          warning: number | null;
        };
        Insert: {
          backup?: number;
          created_at?: string;
          cutoff?: number | null;
          last_adjusted_at?: string | null;
          location_id: string;
          on_hand?: number;
          organization_id: string;
          par?: number | null;
          product_id: string;
          total?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          warning?: number | null;
        };
        Update: {
          backup?: number;
          created_at?: string;
          cutoff?: number | null;
          last_adjusted_at?: string | null;
          location_id?: string;
          on_hand?: number;
          organization_id?: string;
          par?: number | null;
          product_id?: string;
          total?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          warning?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_stock_location_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_stock_product_fk";
            columns: ["product_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_products";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_stock_updater_fk";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_storage_areas: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          display_order: number;
          id: string;
          kind: string;
          location_id: string;
          name: string;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          display_order?: number;
          id?: string;
          kind?: string;
          location_id: string;
          name: string;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          display_order?: number;
          id?: string;
          kind?: string;
          location_id?: string;
          name?: string;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_storage_areas_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_storage_areas_location_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_storage_areas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_storage_areas_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_storage_placements: {
        Row: {
          created_at: string;
          created_by: string | null;
          display_order: number;
          id: string;
          location_id: string;
          organization_id: string;
          product_id: string;
          shelf_id: string;
          slot_label: string | null;
          slot_number: number | null;
          storage_area_id: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          display_order?: number;
          id?: string;
          location_id: string;
          organization_id: string;
          product_id: string;
          shelf_id: string;
          slot_label?: string | null;
          slot_number?: number | null;
          storage_area_id: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          display_order?: number;
          id?: string;
          location_id?: string;
          organization_id?: string;
          product_id?: string;
          shelf_id?: string;
          slot_label?: string | null;
          slot_number?: number | null;
          storage_area_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_storage_placements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_storage_placements_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_storage_placements_product_id_organization_id_fkey";
            columns: ["product_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_products";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_storage_placements_shelf_id_storage_area_id_loca_fkey";
            columns: [
              "shelf_id",
              "storage_area_id",
              "location_id",
              "organization_id",
            ];
            isOneToOne: false;
            referencedRelation: "inventory_storage_shelves";
            referencedColumns: [
              "id",
              "storage_area_id",
              "location_id",
              "organization_id",
            ];
          },
          {
            foreignKeyName: "inventory_storage_placements_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_storage_shelves: {
        Row: {
          created_at: string;
          created_by: string | null;
          display_order: number;
          id: string;
          location_id: string;
          name: string;
          organization_id: string;
          section_name: string | null;
          storage_area_id: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          display_order?: number;
          id?: string;
          location_id: string;
          name: string;
          organization_id: string;
          section_name?: string | null;
          storage_area_id: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          display_order?: number;
          id?: string;
          location_id?: string;
          name?: string;
          organization_id?: string;
          section_name?: string | null;
          storage_area_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_storage_shelves_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_storage_shelves_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_storage_shelves_storage_area_id_location_id_orga_fkey";
            columns: ["storage_area_id", "location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_storage_areas";
            referencedColumns: ["id", "location_id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_storage_shelves_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_subcategories: {
        Row: {
          active: boolean;
          category_id: string;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          name_key: string;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          active?: boolean;
          category_id: string;
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          name_key?: string;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          active?: boolean;
          category_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          name_key?: string;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_subcategories_category_fk";
            columns: ["category_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_categories";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_subcategories_creator_fk";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_subcategories_org_fk";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_subcategories_updater_fk";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_vendors: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string;
          id: string;
          is_system: boolean;
          name: string;
          name_key: string;
          notes: string | null;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by: string;
          id?: string;
          is_system?: boolean;
          name: string;
          name_key?: string;
          notes?: string | null;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string;
          id?: string;
          is_system?: boolean;
          name?: string;
          name_key?: string;
          notes?: string | null;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_vendors_creator_fk";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_vendors_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_vendors_updater_fk";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      kiosk_devices: {
        Row: {
          created_at: string;
          created_by: string | null;
          credential_version: number;
          device_token_hash: string | null;
          id: string;
          last_seen_at: string | null;
          location_id: string;
          name: string;
          organization_id: string;
          revocation_reason: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          credential_version?: number;
          device_token_hash?: string | null;
          id?: string;
          last_seen_at?: string | null;
          location_id: string;
          name: string;
          organization_id: string;
          revocation_reason?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          credential_version?: number;
          device_token_hash?: string | null;
          id?: string;
          last_seen_at?: string | null;
          location_id?: string;
          name?: string;
          organization_id?: string;
          revocation_reason?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kiosk_devices_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kiosk_devices_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      kiosk_pairing_attempts: {
        Row: {
          attempted_at: string;
          client_identifier: string;
          code_hash: string;
          id: number;
          succeeded: boolean;
        };
        Insert: {
          attempted_at?: string;
          client_identifier?: string;
          code_hash: string;
          id?: never;
          succeeded?: boolean;
        };
        Update: {
          attempted_at?: string;
          client_identifier?: string;
          code_hash?: string;
          id?: never;
          succeeded?: boolean;
        };
        Relationships: [];
      };
      kiosk_pairing_codes: {
        Row: {
          attempt_count: number;
          code_hash: string;
          created_at: string;
          created_by: string;
          device_id: string | null;
          device_name: string;
          expires_at: string;
          id: string;
          location_id: string;
          max_attempts: number;
          organization_id: string;
          used_at: string | null;
        };
        Insert: {
          attempt_count?: number;
          code_hash: string;
          created_at?: string;
          created_by: string;
          device_id?: string | null;
          device_name: string;
          expires_at?: string;
          id?: string;
          location_id: string;
          max_attempts?: number;
          organization_id: string;
          used_at?: string | null;
        };
        Update: {
          attempt_count?: number;
          code_hash?: string;
          created_at?: string;
          created_by?: string;
          device_id?: string | null;
          device_name?: string;
          expires_at?: string;
          id?: string;
          location_id?: string;
          max_attempts?: number;
          organization_id?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "kiosk_pairing_codes_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "kiosk_devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kiosk_pairing_codes_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kiosk_pairing_codes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      kiosk_sessions: {
        Row: {
          created_at: string;
          device_id: string;
          display_name: string;
          encrypted_access_token: string;
          expires_at: string;
          id: string;
          location_id: string;
          organization_id: string;
          profile_id: string;
          session_token_hash: string;
        };
        Insert: {
          created_at?: string;
          device_id: string;
          display_name: string;
          encrypted_access_token: string;
          expires_at: string;
          id?: string;
          location_id: string;
          organization_id: string;
          profile_id: string;
          session_token_hash: string;
        };
        Update: {
          created_at?: string;
          device_id?: string;
          display_name?: string;
          encrypted_access_token?: string;
          expires_at?: string;
          id?: string;
          location_id?: string;
          organization_id?: string;
          profile_id?: string;
          session_token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kiosk_sessions_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "kiosk_devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kiosk_sessions_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kiosk_sessions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kiosk_sessions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      location_lifecycle_events: {
        Row: {
          action: string;
          actor_profile_id: string;
          blockers_snapshot: Json;
          changed_at: string;
          id: number;
          location_id: string;
          new_state: string;
          organization_id: string;
          previous_state: string;
          reason: string;
        };
        Insert: {
          action: string;
          actor_profile_id: string;
          blockers_snapshot?: Json;
          changed_at?: string;
          id?: never;
          location_id: string;
          new_state: string;
          organization_id: string;
          previous_state: string;
          reason: string;
        };
        Update: {
          action?: string;
          actor_profile_id?: string;
          blockers_snapshot?: Json;
          changed_at?: string;
          id?: never;
          location_id?: string;
          new_state?: string;
          organization_id?: string;
          previous_state?: string;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: "location_lifecycle_events_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      location_memberships: {
        Row: {
          active: boolean;
          created_at: string;
          id: number;
          location_id: string;
          profile_id: string;
          role: Database["public"]["Enums"]["location_role"];
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: never;
          location_id: string;
          profile_id: string;
          role?: Database["public"]["Enums"]["location_role"];
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: never;
          location_id?: string;
          profile_id?: string;
          role?: Database["public"]["Enums"]["location_role"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "location_memberships_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "location_memberships_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      location_module_configs: {
        Row: {
          created_at: string;
          is_enabled: boolean;
          location_id: string;
          metadata: Json;
          module_key: Database["public"]["Enums"]["location_module_key"];
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          is_enabled: boolean;
          location_id: string;
          metadata?: Json;
          module_key: Database["public"]["Enums"]["location_module_key"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          is_enabled?: boolean;
          location_id?: string;
          metadata?: Json;
          module_key?: Database["public"]["Enums"]["location_module_key"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "location_module_configs_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      locations: {
        Row: {
          active: boolean;
          address: Json;
          archived_at: string | null;
          attendance_mode:
            | Database["public"]["Enums"]["attendance_mode"]
            | null;
          closing_local: string;
          cover_weight: number;
          created_at: string;
          id: string;
          name: string;
          opening_local: string;
          organization_id: string;
          time_zone: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          address?: Json;
          archived_at?: string | null;
          attendance_mode?:
            | Database["public"]["Enums"]["attendance_mode"]
            | null;
          closing_local?: string;
          cover_weight?: number;
          created_at?: string;
          id?: string;
          name: string;
          opening_local?: string;
          organization_id: string;
          time_zone?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          address?: Json;
          archived_at?: string | null;
          attendance_mode?:
            | Database["public"]["Enums"]["attendance_mode"]
            | null;
          closing_local?: string;
          cover_weight?: number;
          created_at?: string;
          id?: string;
          name?: string;
          opening_local?: string;
          organization_id?: string;
          time_zone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          active: boolean;
          created_at: string;
          id: number;
          organization_id: string;
          profile_id: string;
          roles: Database["public"]["Enums"]["app_role"][];
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: never;
          organization_id: string;
          profile_id: string;
          roles: Database["public"]["Enums"]["app_role"][];
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: never;
          organization_id?: string;
          profile_id?: string;
          roles?: Database["public"]["Enums"]["app_role"][];
        };
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      module_enforcement_settings: {
        Row: {
          activated_at: string | null;
          activation_reference: string | null;
          mode: string;
          singleton: boolean;
          updated_at: string;
        };
        Insert: {
          activated_at?: string | null;
          activation_reference?: string | null;
          mode?: string;
          singleton?: boolean;
          updated_at?: string;
        };
        Update: {
          activated_at?: string | null;
          activation_reference?: string | null;
          mode?: string;
          singleton?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      operating_hours: {
        Row: {
          closed: boolean;
          closing_local: string | null;
          created_at: string;
          day_of_week: number;
          id: number;
          location_id: string;
          opening_local: string | null;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          closed?: boolean;
          closing_local?: string | null;
          created_at?: string;
          day_of_week: number;
          id?: never;
          location_id: string;
          opening_local?: string | null;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          closed?: boolean;
          closing_local?: string | null;
          created_at?: string;
          day_of_week?: number;
          id?: never;
          location_id?: string;
          opening_local?: string | null;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "operating_hours_location_id_organization_id_fkey";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "operating_hours_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          settings: Json;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          settings?: Json;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          settings?: Json;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      overall_roles: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: number;
          profile_id: string;
          role: Database["public"]["Enums"]["overall_role"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: never;
          profile_id: string;
          role: Database["public"]["Enums"]["overall_role"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: never;
          profile_id?: string;
          role?: Database["public"]["Enums"]["overall_role"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "overall_roles_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "overall_roles_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      passcode_credentials: {
        Row: {
          active: boolean;
          created_at: string;
          id: number;
          locator: string;
          organization_id: string;
          profile_id: string;
          synthetic_email: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: never;
          locator: string;
          organization_id: string;
          profile_id: string;
          synthetic_email: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: never;
          locator?: string;
          organization_id?: string;
          profile_id?: string;
          synthetic_email?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "passcode_credentials_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "passcode_credentials_organization_id_profile_id_fkey";
            columns: ["organization_id", "profile_id"];
            isOneToOne: true;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      passcode_lockout_resets: {
        Row: {
          cleared_at: string;
          cleared_by: string;
          id: number;
          organization_id: string;
          reason: string;
        };
        Insert: {
          cleared_at?: string;
          cleared_by: string;
          id?: never;
          organization_id: string;
          reason: string;
        };
        Update: {
          cleared_at?: string;
          cleared_by?: string;
          id?: never;
          organization_id?: string;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: "passcode_lockout_resets_organization_id_cleared_by_fkey";
            columns: ["organization_id", "cleared_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "passcode_lockout_resets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      passcode_login_attempts: {
        Row: {
          attempted_at: string;
          fingerprint: string;
          id: number;
          organization_id: string;
          succeeded: boolean;
        };
        Insert: {
          attempted_at?: string;
          fingerprint: string;
          id?: never;
          organization_id: string;
          succeeded?: boolean;
        };
        Update: {
          attempted_at?: string;
          fingerprint?: string;
          id?: never;
          organization_id?: string;
          succeeded?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "passcode_login_attempts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_adjustments: {
        Row: {
          created_at: string;
          created_by: string;
          delta_cents: number;
          id: number;
          organization_id: string;
          payroll_period_id: number;
          reason: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          delta_cents: number;
          id?: never;
          organization_id: string;
          payroll_period_id: number;
          reason: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          delta_cents?: number;
          id?: never;
          organization_id?: string;
          payroll_period_id?: number;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_adjustments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_adjustments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_adjustments_payroll_period_id_fkey";
            columns: ["payroll_period_id"];
            isOneToOne: false;
            referencedRelation: "payroll_native_period_reconciliation";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "payroll_adjustments_payroll_period_id_fkey";
            columns: ["payroll_period_id"];
            isOneToOne: false;
            referencedRelation: "payroll_periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_adjustments_period_org_fk";
            columns: ["payroll_period_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "payroll_native_period_reconciliation";
            referencedColumns: ["period_id", "organization_id"];
          },
          {
            foreignKeyName: "payroll_adjustments_period_org_fk";
            columns: ["payroll_period_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "payroll_periods";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      payroll_attendance_consumption_reviews: {
        Row: {
          baseline_net_seconds: number | null;
          consumed_version: number;
          consumption_id: number;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          delta_net_seconds: number | null;
          id: number;
          location_id: string;
          observed_net_seconds: number | null;
          observed_version: number;
          observed_voided: boolean;
          organization_id: string;
          payroll_adjustment_id: number | null;
          period_id: number;
          profile_id: string;
          session_id: string;
          state: string;
        };
        Insert: {
          baseline_net_seconds?: number | null;
          consumed_version: number;
          consumption_id: number;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          delta_net_seconds?: number | null;
          id?: never;
          location_id: string;
          observed_net_seconds?: number | null;
          observed_version: number;
          observed_voided?: boolean;
          organization_id: string;
          payroll_adjustment_id?: number | null;
          period_id: number;
          profile_id: string;
          session_id: string;
          state?: string;
        };
        Update: {
          baseline_net_seconds?: number | null;
          consumed_version?: number;
          consumption_id?: number;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          delta_net_seconds?: number | null;
          id?: never;
          location_id?: string;
          observed_net_seconds?: number | null;
          observed_version?: number;
          observed_voided?: boolean;
          organization_id?: string;
          payroll_adjustment_id?: number | null;
          period_id?: number;
          profile_id?: string;
          session_id?: string;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_attendance_consumption_revie_payroll_adjustment_id_fkey";
            columns: ["payroll_adjustment_id"];
            isOneToOne: false;
            referencedRelation: "payroll_adjustments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_attendance_consumption_reviews_consumption_id_fkey";
            columns: ["consumption_id"];
            isOneToOne: false;
            referencedRelation: "payroll_attendance_consumption_staleness";
            referencedColumns: ["consumption_id"];
          },
          {
            foreignKeyName: "payroll_attendance_consumption_reviews_consumption_id_fkey";
            columns: ["consumption_id"];
            isOneToOne: false;
            referencedRelation: "payroll_attendance_consumptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_attendance_consumption_reviews_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_attendance_consumption_reviews_period_fk";
            columns: ["period_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "payroll_native_period_reconciliation";
            referencedColumns: ["period_id", "organization_id"];
          },
          {
            foreignKeyName: "payroll_attendance_consumption_reviews_period_fk";
            columns: ["period_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "payroll_periods";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      payroll_attendance_consumptions: {
        Row: {
          consumed_at: string;
          consumed_by: string;
          consumer_ref: number;
          consumer_type: string;
          gross_elapsed_seconds: number;
          id: number;
          location_id: string;
          net_payable_seconds: number;
          organization_id: string;
          period_month: string;
          profile_id: string;
          service_date: string;
          session_id: string;
          source_version: number;
          status: string;
          superseded_at: string | null;
          superseded_by: string | null;
          superseded_reason: string | null;
          unpaid_break_seconds: number;
        };
        Insert: {
          consumed_at?: string;
          consumed_by: string;
          consumer_ref: number;
          consumer_type: string;
          gross_elapsed_seconds: number;
          id?: never;
          location_id: string;
          net_payable_seconds: number;
          organization_id: string;
          period_month: string;
          profile_id: string;
          service_date: string;
          session_id: string;
          source_version: number;
          status?: string;
          superseded_at?: string | null;
          superseded_by?: string | null;
          superseded_reason?: string | null;
          unpaid_break_seconds: number;
        };
        Update: {
          consumed_at?: string;
          consumed_by?: string;
          consumer_ref?: number;
          consumer_type?: string;
          gross_elapsed_seconds?: number;
          id?: never;
          location_id?: string;
          net_payable_seconds?: number;
          organization_id?: string;
          period_month?: string;
          profile_id?: string;
          service_date?: string;
          session_id?: string;
          source_version?: number;
          status?: string;
          superseded_at?: string | null;
          superseded_by?: string | null;
          superseded_reason?: string | null;
          unpaid_break_seconds?: number;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_attendance_consumptions_consumed_by_fkey";
            columns: ["consumed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_attendance_consumptions_period_fk";
            columns: [
              "consumer_ref",
              "organization_id",
              "profile_id",
              "period_month",
            ];
            isOneToOne: false;
            referencedRelation: "payroll_native_period_reconciliation";
            referencedColumns: [
              "period_id",
              "organization_id",
              "profile_id",
              "period_month",
            ];
          },
          {
            foreignKeyName: "payroll_attendance_consumptions_period_fk";
            columns: [
              "consumer_ref",
              "organization_id",
              "profile_id",
              "period_month",
            ];
            isOneToOne: false;
            referencedRelation: "payroll_periods";
            referencedColumns: [
              "id",
              "organization_id",
              "profile_id",
              "period_month",
            ];
          },
          {
            foreignKeyName: "payroll_attendance_consumptions_session_fk";
            columns: [
              "session_id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
            isOneToOne: false;
            referencedRelation: "attendance_session_summaries";
            referencedColumns: [
              "session_id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
          },
          {
            foreignKeyName: "payroll_attendance_consumptions_session_fk";
            columns: [
              "session_id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
            isOneToOne: false;
            referencedRelation: "attendance_sessions";
            referencedColumns: [
              "id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
          },
          {
            foreignKeyName: "payroll_attendance_consumptions_superseded_by_fkey";
            columns: ["superseded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_payments: {
        Row: {
          amount_cents: number;
          comment: string | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
          created_by: string;
          id: number;
          organization_id: string;
          payment_date: string;
          payroll_period_id: number;
          reverses_payment_id: number | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          comment?: string | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          created_by: string;
          id?: never;
          organization_id: string;
          payment_date: string;
          payroll_period_id: number;
          reverses_payment_id?: number | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          comment?: string | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          created_by?: string;
          id?: never;
          organization_id?: string;
          payment_date?: string;
          payroll_period_id?: number;
          reverses_payment_id?: number | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_payments_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_payments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_payments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_payments_organization_id_reverses_payment_id_fkey";
            columns: ["organization_id", "reverses_payment_id"];
            isOneToOne: false;
            referencedRelation: "payroll_payments";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "payroll_payments_payroll_period_id_fkey";
            columns: ["payroll_period_id"];
            isOneToOne: false;
            referencedRelation: "payroll_native_period_reconciliation";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "payroll_payments_payroll_period_id_fkey";
            columns: ["payroll_period_id"];
            isOneToOne: false;
            referencedRelation: "payroll_periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_payments_period_org_fk";
            columns: ["payroll_period_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "payroll_native_period_reconciliation";
            referencedColumns: ["period_id", "organization_id"];
          },
          {
            foreignKeyName: "payroll_payments_period_org_fk";
            columns: ["payroll_period_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "payroll_periods";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      payroll_periods: {
        Row: {
          attendance_source: string;
          generated_at: string;
          generated_by: string;
          gross_cents: number;
          hours_snapshot: number;
          id: number;
          location_id: string | null;
          locked_at: string | null;
          locked_by: string | null;
          neon_user_id: number | null;
          organization_id: string;
          period_month: string;
          profile_id: string | null;
          rate_cents_snapshot: number;
          regenerated_at: string | null;
          regenerated_by: string | null;
          status: string;
        };
        Insert: {
          attendance_source?: string;
          generated_at?: string;
          generated_by: string;
          gross_cents: number;
          hours_snapshot: number;
          id?: never;
          location_id?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          neon_user_id?: number | null;
          organization_id: string;
          period_month: string;
          profile_id?: string | null;
          rate_cents_snapshot: number;
          regenerated_at?: string | null;
          regenerated_by?: string | null;
          status?: string;
        };
        Update: {
          attendance_source?: string;
          generated_at?: string;
          generated_by?: string;
          gross_cents?: number;
          hours_snapshot?: number;
          id?: never;
          location_id?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          neon_user_id?: number | null;
          organization_id?: string;
          period_month?: string;
          profile_id?: string | null;
          rate_cents_snapshot?: number;
          regenerated_at?: string | null;
          regenerated_by?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_periods_generated_by_fkey";
            columns: ["generated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_periods_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_periods_location_org_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "payroll_periods_locked_by_fkey";
            columns: ["locked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_periods_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_periods_profile_membership_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "payroll_periods_regenerated_by_fkey";
            columns: ["regenerated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_rates: {
        Row: {
          attendance_source: string;
          id: number;
          neon_user_id: number | null;
          organization_id: string;
          profile_id: string | null;
          rate_cents: number;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          attendance_source?: string;
          id?: never;
          neon_user_id?: number | null;
          organization_id: string;
          profile_id?: string | null;
          rate_cents: number;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          attendance_source?: string;
          id?: never;
          neon_user_id?: number | null;
          organization_id?: string;
          profile_id?: string | null;
          rate_cents?: number;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_rates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_rates_profile_membership_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "payroll_rates_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_settings: {
        Row: {
          default_rate_cents: number;
          organization_id: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          default_rate_cents: number;
          organization_id: string;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          default_rate_cents?: number;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      registrations: {
        Row: {
          contact: string | null;
          created_at: string;
          display_name: string;
          id: number;
          organization_id: string;
          profile_id: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          self_served: boolean;
          status: Database["public"]["Enums"]["access_request_status"];
        };
        Insert: {
          contact?: string | null;
          created_at?: string;
          display_name: string;
          id?: never;
          organization_id: string;
          profile_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          self_served?: boolean;
          status?: Database["public"]["Enums"]["access_request_status"];
        };
        Update: {
          contact?: string | null;
          created_at?: string;
          display_name?: string;
          id?: never;
          organization_id?: string;
          profile_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          self_served?: boolean;
          status?: Database["public"]["Enums"]["access_request_status"];
        };
        Relationships: [
          {
            foreignKeyName: "access_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "access_requests_organization_id_reviewed_by_fkey";
            columns: ["organization_id", "reviewed_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "registrations_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      rotation_members: {
        Row: {
          active_table_count: number;
          cover_count: number;
          id: number;
          last_seated_at: string | null;
          max_concurrent_tables: number | null;
          organization_id: string;
          party_count: number;
          position: number;
          server_profile_id: string;
          service_session_id: number;
          status: Database["public"]["Enums"]["rotation_status"];
          updated_at: string;
        };
        Insert: {
          active_table_count?: number;
          cover_count?: number;
          id?: never;
          last_seated_at?: string | null;
          max_concurrent_tables?: number | null;
          organization_id: string;
          party_count?: number;
          position: number;
          server_profile_id: string;
          service_session_id: number;
          status?: Database["public"]["Enums"]["rotation_status"];
          updated_at?: string;
        };
        Update: {
          active_table_count?: number;
          cover_count?: number;
          id?: never;
          last_seated_at?: string | null;
          max_concurrent_tables?: number | null;
          organization_id?: string;
          party_count?: number;
          position?: number;
          server_profile_id?: string;
          service_session_id?: number;
          status?: Database["public"]["Enums"]["rotation_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rotation_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rotation_members_server_fk";
            columns: ["organization_id", "server_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "rotation_members_server_profile_id_fkey";
            columns: ["server_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rotation_members_service_session_id_fkey";
            columns: ["service_session_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rotation_members_session_tenant_fk";
            columns: ["service_session_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      rotation_rounds: {
        Row: {
          created_at: string;
          id: number;
          organization_id: string;
          sequence: number;
          service_session_id: number;
        };
        Insert: {
          created_at?: string;
          id?: never;
          organization_id: string;
          sequence: number;
          service_session_id: number;
        };
        Update: {
          created_at?: string;
          id?: never;
          organization_id?: string;
          sequence?: number;
          service_session_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "rotation_rounds_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rotation_rounds_service_session_id_organization_id_fkey";
            columns: ["service_session_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      schedule_periods: {
        Row: {
          created_at: string;
          ends_on: string;
          id: number;
          location_id: string;
          organization_id: string;
          published_at: string | null;
          published_by: string | null;
          published_version: number;
          starts_on: string;
          status: Database["public"]["Enums"]["schedule_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ends_on: string;
          id?: never;
          location_id: string;
          organization_id: string;
          published_at?: string | null;
          published_by?: string | null;
          published_version?: number;
          starts_on: string;
          status?: Database["public"]["Enums"]["schedule_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ends_on?: string;
          id?: never;
          location_id?: string;
          organization_id?: string;
          published_at?: string | null;
          published_by?: string | null;
          published_version?: number;
          starts_on?: string;
          status?: Database["public"]["Enums"]["schedule_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_periods_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_periods_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "schedule_periods_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_periods_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      seating_tables: {
        Row: {
          dining_table_id: number;
          organization_id: string;
          released_at: string | null;
          seating_id: number;
        };
        Insert: {
          dining_table_id: number;
          organization_id: string;
          released_at?: string | null;
          seating_id: number;
        };
        Update: {
          dining_table_id?: number;
          organization_id?: string;
          released_at?: string | null;
          seating_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "seating_tables_dining_table_id_fkey";
            columns: ["dining_table_id"];
            isOneToOne: false;
            referencedRelation: "dining_tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seating_tables_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seating_tables_seating_id_fkey";
            columns: ["seating_id"];
            isOneToOne: false;
            referencedRelation: "seatings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seating_tables_seating_tenant_fk";
            columns: ["seating_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "seatings";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "seating_tables_table_tenant_fk";
            columns: ["dining_table_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "dining_tables";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      seatings: {
        Row: {
          closed_at: string | null;
          created_at: string;
          decided_by: string;
          id: number;
          idempotency_key: string;
          location_id: string;
          notes: string | null;
          organization_id: string;
          override_reason: string | null;
          party_size: number;
          seated_at: string;
          server_profile_id: string;
          service_session_id: number;
          status: Database["public"]["Enums"]["seating_status"];
        };
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          decided_by: string;
          id?: never;
          idempotency_key: string;
          location_id: string;
          notes?: string | null;
          organization_id: string;
          override_reason?: string | null;
          party_size: number;
          seated_at?: string;
          server_profile_id: string;
          service_session_id: number;
          status?: Database["public"]["Enums"]["seating_status"];
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          decided_by?: string;
          id?: never;
          idempotency_key?: string;
          location_id?: string;
          notes?: string | null;
          organization_id?: string;
          override_reason?: string | null;
          party_size?: number;
          seated_at?: string;
          server_profile_id?: string;
          service_session_id?: number;
          status?: Database["public"]["Enums"]["seating_status"];
        };
        Relationships: [
          {
            foreignKeyName: "seatings_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seatings_decider_member_fk";
            columns: ["organization_id", "decided_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "seatings_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seatings_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "seatings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seatings_server_member_fk";
            columns: ["organization_id", "server_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "seatings_server_profile_id_fkey";
            columns: ["server_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seatings_service_session_id_fkey";
            columns: ["service_session_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seatings_session_tenant_fk";
            columns: ["service_session_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      section_assignments: {
        Row: {
          created_at: string;
          dining_table_id: number;
          id: number;
          location_id: string;
          locked: boolean;
          organization_id: string;
          released_at: string | null;
          rotation_member_id: number | null;
          server_profile_id: string | null;
          service_session_id: number;
          table_rotation_entry_id: number | null;
        };
        Insert: {
          created_at?: string;
          dining_table_id: number;
          id?: never;
          location_id: string;
          locked?: boolean;
          organization_id: string;
          released_at?: string | null;
          rotation_member_id?: number | null;
          server_profile_id?: string | null;
          service_session_id: number;
          table_rotation_entry_id?: number | null;
        };
        Update: {
          created_at?: string;
          dining_table_id?: number;
          id?: never;
          location_id?: string;
          locked?: boolean;
          organization_id?: string;
          released_at?: string | null;
          rotation_member_id?: number | null;
          server_profile_id?: string | null;
          service_session_id?: number;
          table_rotation_entry_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "section_assignments_dining_table_id_fkey";
            columns: ["dining_table_id"];
            isOneToOne: false;
            referencedRelation: "dining_tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "section_assignments_entry_fk";
            columns: ["table_rotation_entry_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "table_rotation_entries";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "section_assignments_entry_session_fk";
            columns: ["table_rotation_entry_id", "service_session_id"];
            isOneToOne: false;
            referencedRelation: "table_rotation_entries";
            referencedColumns: ["id", "service_session_id"];
          },
          {
            foreignKeyName: "section_assignments_member_session_fk";
            columns: ["rotation_member_id", "service_session_id"];
            isOneToOne: false;
            referencedRelation: "rotation_members";
            referencedColumns: ["id", "service_session_id"];
          },
          {
            foreignKeyName: "section_assignments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "section_assignments_rotation_member_fk";
            columns: ["rotation_member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "rotation_members";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "section_assignments_server_fk";
            columns: ["organization_id", "server_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "section_assignments_server_profile_id_fkey";
            columns: ["server_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "section_assignments_service_session_id_fkey";
            columns: ["service_session_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "section_assignments_session_location_fk";
            columns: ["service_session_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id", "location_id"];
          },
          {
            foreignKeyName: "section_assignments_session_tenant_fk";
            columns: ["service_session_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "section_assignments_table_location_fk";
            columns: ["dining_table_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "dining_tables";
            referencedColumns: ["id", "location_id"];
          },
          {
            foreignKeyName: "section_assignments_table_tenant_fk";
            columns: ["dining_table_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "dining_tables";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      service_sessions: {
        Row: {
          closed_at: string | null;
          closed_by: string | null;
          created_at: string;
          id: number;
          location_id: string;
          meal_period: string;
          organization_id: string;
          service_date: string;
          started_at: string | null;
          started_by: string | null;
          status: Database["public"]["Enums"]["service_status"];
        };
        Insert: {
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          id?: never;
          location_id: string;
          meal_period: string;
          organization_id: string;
          service_date: string;
          started_at?: string | null;
          started_by?: string | null;
          status?: Database["public"]["Enums"]["service_status"];
        };
        Update: {
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          id?: never;
          location_id?: string;
          meal_period?: string;
          organization_id?: string;
          service_date?: string;
          started_at?: string | null;
          started_by?: string | null;
          status?: Database["public"]["Enums"]["service_status"];
        };
        Relationships: [
          {
            foreignKeyName: "service_sessions_closed_by_fkey";
            columns: ["closed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_sessions_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_sessions_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "service_sessions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_sessions_started_by_fkey";
            columns: ["started_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      shift_assignments: {
        Row: {
          created_at: string;
          id: number;
          organization_id: string;
          profile_id: string;
          shift_id: number;
        };
        Insert: {
          created_at?: string;
          id?: never;
          organization_id: string;
          profile_id: string;
          shift_id: number;
        };
        Update: {
          created_at?: string;
          id?: never;
          organization_id?: string;
          profile_id?: string;
          shift_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "shift_assignments_member_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "shift_assignments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_shift_tenant_fk";
            columns: ["shift_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "shifts";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      shift_kind_defaults: {
        Row: {
          end_local: string;
          id: number;
          kind: Database["public"]["Enums"]["shift_kind"];
          location_id: string;
          organization_id: string;
          start_local: string;
          updated_at: string;
        };
        Insert: {
          end_local: string;
          id?: never;
          kind: Database["public"]["Enums"]["shift_kind"];
          location_id: string;
          organization_id: string;
          start_local: string;
          updated_at?: string;
        };
        Update: {
          end_local?: string;
          id?: never;
          kind?: Database["public"]["Enums"]["shift_kind"];
          location_id?: string;
          organization_id?: string;
          start_local?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shift_kind_defaults_location_id_organization_id_fkey";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "shift_kind_defaults_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      shift_templates: {
        Row: {
          created_at: string;
          end_local: string;
          id: number;
          kind: Database["public"]["Enums"]["shift_kind"] | null;
          location_id: string;
          name: string;
          organization_id: string;
          role_label: string;
          start_local: string;
          station: string | null;
        };
        Insert: {
          created_at?: string;
          end_local: string;
          id?: never;
          kind?: Database["public"]["Enums"]["shift_kind"] | null;
          location_id: string;
          name: string;
          organization_id: string;
          role_label: string;
          start_local: string;
          station?: string | null;
        };
        Update: {
          created_at?: string;
          end_local?: string;
          id?: never;
          kind?: Database["public"]["Enums"]["shift_kind"] | null;
          location_id?: string;
          name?: string;
          organization_id?: string;
          role_label?: string;
          start_local?: string;
          station?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shift_templates_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_templates_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "shift_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      shifts: {
        Row: {
          created_at: string;
          end_date: string;
          ends_at: string;
          id: number;
          is_recurring: boolean;
          kind: Database["public"]["Enums"]["shift_kind"];
          location_id: string;
          notes: string | null;
          organization_id: string;
          role_label: string;
          schedule_period_id: number;
          series_id: string | null;
          service_date: string;
          starts_at: string;
          station: string | null;
          template_id: number | null;
          uses_default_time: boolean;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          ends_at: string;
          id?: never;
          is_recurring?: boolean;
          kind?: Database["public"]["Enums"]["shift_kind"];
          location_id: string;
          notes?: string | null;
          organization_id: string;
          role_label: string;
          schedule_period_id: number;
          series_id?: string | null;
          service_date: string;
          starts_at: string;
          station?: string | null;
          template_id?: number | null;
          uses_default_time?: boolean;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          ends_at?: string;
          id?: never;
          is_recurring?: boolean;
          kind?: Database["public"]["Enums"]["shift_kind"];
          location_id?: string;
          notes?: string | null;
          organization_id?: string;
          role_label?: string;
          schedule_period_id?: number;
          series_id?: string | null;
          service_date?: string;
          starts_at?: string;
          station?: string | null;
          template_id?: number | null;
          uses_default_time?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "shifts_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shifts_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "shifts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shifts_period_tenant_fk";
            columns: ["schedule_period_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schedule_periods";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "shifts_schedule_period_id_fkey";
            columns: ["schedule_period_id"];
            isOneToOne: false;
            referencedRelation: "schedule_periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shifts_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "shift_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shifts_template_tenant_fk";
            columns: ["template_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "shift_templates";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      table_rotation_entries: {
        Row: {
          assigned_at: string;
          assigned_by: string;
          ended_at: string | null;
          ended_by: string | null;
          id: number;
          organization_id: string;
          rotation_member_id: number;
          rotation_round_id: number;
          service_session_id: number;
          status: string;
          table_label: string | null;
        };
        Insert: {
          assigned_at?: string;
          assigned_by: string;
          ended_at?: string | null;
          ended_by?: string | null;
          id?: never;
          organization_id: string;
          rotation_member_id: number;
          rotation_round_id: number;
          service_session_id: number;
          status?: string;
          table_label?: string | null;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string;
          ended_at?: string | null;
          ended_by?: string | null;
          id?: never;
          organization_id?: string;
          rotation_member_id?: number;
          rotation_round_id?: number;
          service_session_id?: number;
          status?: string;
          table_label?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "table_rotation_entries_assigned_profile_fk";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "table_rotation_entries_ended_profile_fk";
            columns: ["ended_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "table_rotation_entries_member_session_fk";
            columns: ["rotation_member_id", "service_session_id"];
            isOneToOne: false;
            referencedRelation: "rotation_members";
            referencedColumns: ["id", "service_session_id"];
          },
          {
            foreignKeyName: "table_rotation_entries_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "table_rotation_entries_rotation_member_id_organization_id_fkey";
            columns: ["rotation_member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "rotation_members";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "table_rotation_entries_rotation_round_id_organization_id_fkey";
            columns: ["rotation_round_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "rotation_rounds";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "table_rotation_entries_round_session_fk";
            columns: ["rotation_round_id", "service_session_id"];
            isOneToOne: false;
            referencedRelation: "rotation_rounds";
            referencedColumns: ["id", "service_session_id"];
          },
        ];
      };
      task_assignments: {
        Row: {
          assigned_at: string;
          assigned_by: string;
          organization_id: string;
          profile_id: string;
          task_id: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by: string;
          organization_id: string;
          profile_id: string;
          task_id: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string;
          organization_id?: string;
          profile_id?: string;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_assignments_assigned_by_profile_fk";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_member_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "task_assignments_task_fk";
            columns: ["task_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      task_categories: {
        Row: {
          name: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          name: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          name?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      task_events: {
        Row: {
          actor_profile_id: string | null;
          checklist_instance_id: string | null;
          created_at: string;
          event_type: Database["public"]["Enums"]["task_event_type"];
          id: number;
          organization_id: string;
          payload: Json;
          task_id: string | null;
        };
        Insert: {
          actor_profile_id?: string | null;
          checklist_instance_id?: string | null;
          created_at?: string;
          event_type: Database["public"]["Enums"]["task_event_type"];
          id?: never;
          organization_id: string;
          payload?: Json;
          task_id?: string | null;
        };
        Update: {
          actor_profile_id?: string | null;
          checklist_instance_id?: string | null;
          created_at?: string;
          event_type?: Database["public"]["Enums"]["task_event_type"];
          id?: never;
          organization_id?: string;
          payload?: Json;
          task_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "task_events_actor_profile_id_profile_fk";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_events_instance_fk";
            columns: ["checklist_instance_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "checklist_instances";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "task_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_events_task_fk";
            columns: ["task_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      task_notifications: {
        Row: {
          body: string | null;
          checklist_instance_id: string | null;
          created_at: string;
          dedupe_key: string | null;
          id: number;
          location_id: string | null;
          organization_id: string;
          payload: Json | null;
          read_at: string | null;
          recipient_profile_id: string;
          task_id: string | null;
          title: string;
          type: Database["public"]["Enums"]["task_notification_type"];
        };
        Insert: {
          body?: string | null;
          checklist_instance_id?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          id?: never;
          location_id?: string | null;
          organization_id: string;
          payload?: Json | null;
          read_at?: string | null;
          recipient_profile_id: string;
          task_id?: string | null;
          title: string;
          type: Database["public"]["Enums"]["task_notification_type"];
        };
        Update: {
          body?: string | null;
          checklist_instance_id?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          id?: never;
          location_id?: string | null;
          organization_id?: string;
          payload?: Json | null;
          read_at?: string | null;
          recipient_profile_id?: string;
          task_id?: string | null;
          title?: string;
          type?: Database["public"]["Enums"]["task_notification_type"];
        };
        Relationships: [
          {
            foreignKeyName: "task_notifications_instance_fk";
            columns: ["checklist_instance_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "checklist_instances";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "task_notifications_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "task_notifications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_notifications_recipient_fk";
            columns: ["organization_id", "recipient_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "task_notifications_task_fk";
            columns: ["task_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      task_recurrence_assignees: {
        Row: {
          organization_id: string;
          profile_id: string;
          rule_id: string;
        };
        Insert: {
          organization_id: string;
          profile_id: string;
          rule_id: string;
        };
        Update: {
          organization_id?: string;
          profile_id?: string;
          rule_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_recurrence_assignees_member_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "task_recurrence_assignees_rule_fk";
            columns: ["rule_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "task_recurrence_rules";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      task_recurrence_rules: {
        Row: {
          active: boolean;
          assignment_mode: Database["public"]["Enums"]["task_assignment_mode"];
          category: string;
          created_at: string;
          created_by: string;
          day_of_month: number | null;
          due_time: string | null;
          due_window: Database["public"]["Enums"]["task_due_window"] | null;
          end_type: Database["public"]["Enums"]["recurrence_end_type"];
          ends_on: string | null;
          frequency: Database["public"]["Enums"]["recurrence_frequency"];
          id: string;
          instructions: string | null;
          location_id: string;
          max_occurrences: number | null;
          organization_id: string;
          priority: Database["public"]["Enums"]["task_priority"];
          starts_on: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
          weekdays: number[] | null;
        };
        Insert: {
          active?: boolean;
          assignment_mode?: Database["public"]["Enums"]["task_assignment_mode"];
          category?: string;
          created_at?: string;
          created_by: string;
          day_of_month?: number | null;
          due_time?: string | null;
          due_window?: Database["public"]["Enums"]["task_due_window"] | null;
          end_type?: Database["public"]["Enums"]["recurrence_end_type"];
          ends_on?: string | null;
          frequency: Database["public"]["Enums"]["recurrence_frequency"];
          id?: string;
          instructions?: string | null;
          location_id: string;
          max_occurrences?: number | null;
          organization_id: string;
          priority?: Database["public"]["Enums"]["task_priority"];
          starts_on: string;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          weekdays?: number[] | null;
        };
        Update: {
          active?: boolean;
          assignment_mode?: Database["public"]["Enums"]["task_assignment_mode"];
          category?: string;
          created_at?: string;
          created_by?: string;
          day_of_month?: number | null;
          due_time?: string | null;
          due_window?: Database["public"]["Enums"]["task_due_window"] | null;
          end_type?: Database["public"]["Enums"]["recurrence_end_type"];
          ends_on?: string | null;
          frequency?: Database["public"]["Enums"]["recurrence_frequency"];
          id?: string;
          instructions?: string | null;
          location_id?: string;
          max_occurrences?: number | null;
          organization_id?: string;
          priority?: Database["public"]["Enums"]["task_priority"];
          starts_on?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          weekdays?: number[] | null;
        };
        Relationships: [
          {
            foreignKeyName: "task_recurrence_rules_category_fkey";
            columns: ["category"];
            isOneToOne: false;
            referencedRelation: "task_categories";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "task_recurrence_rules_created_by_profile_fk";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_recurrence_rules_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "task_recurrence_rules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_recurrence_rules_updated_by_profile_fk";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          assignment_mode: Database["public"]["Enums"]["task_assignment_mode"];
          blocked_reason: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          category: string;
          checklist_instance_id: string | null;
          completed_at: string | null;
          completed_by: string | null;
          completion_note: string | null;
          created_at: string;
          created_by: string;
          due_at: string | null;
          due_date: string | null;
          due_time: string | null;
          due_window: Database["public"]["Enums"]["task_due_window"] | null;
          group_id: string | null;
          id: string;
          instructions: string | null;
          kind: Database["public"]["Enums"]["task_kind"];
          location_id: string;
          occurrence_date: string | null;
          organization_id: string;
          priority: Database["public"]["Enums"]["task_priority"];
          recurrence_rule_id: string | null;
          sort_order: number;
          start_date: string | null;
          started_at: string | null;
          started_by: string | null;
          status: Database["public"]["Enums"]["task_status"];
          template_item_id: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          assignment_mode?: Database["public"]["Enums"]["task_assignment_mode"];
          blocked_reason?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          category?: string;
          checklist_instance_id?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          completion_note?: string | null;
          created_at?: string;
          created_by: string;
          due_at?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          due_window?: Database["public"]["Enums"]["task_due_window"] | null;
          group_id?: string | null;
          id?: string;
          instructions?: string | null;
          kind?: Database["public"]["Enums"]["task_kind"];
          location_id: string;
          occurrence_date?: string | null;
          organization_id: string;
          priority?: Database["public"]["Enums"]["task_priority"];
          recurrence_rule_id?: string | null;
          sort_order?: number;
          start_date?: string | null;
          started_at?: string | null;
          started_by?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          template_item_id?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          assignment_mode?: Database["public"]["Enums"]["task_assignment_mode"];
          blocked_reason?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          category?: string;
          checklist_instance_id?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          completion_note?: string | null;
          created_at?: string;
          created_by?: string;
          due_at?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          due_window?: Database["public"]["Enums"]["task_due_window"] | null;
          group_id?: string | null;
          id?: string;
          instructions?: string | null;
          kind?: Database["public"]["Enums"]["task_kind"];
          location_id?: string;
          occurrence_date?: string | null;
          organization_id?: string;
          priority?: Database["public"]["Enums"]["task_priority"];
          recurrence_rule_id?: string | null;
          sort_order?: number;
          start_date?: string | null;
          started_at?: string | null;
          started_by?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          template_item_id?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_cancelled_by_profile_fk";
            columns: ["cancelled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_category_fkey";
            columns: ["category"];
            isOneToOne: false;
            referencedRelation: "task_categories";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "tasks_completed_by_profile_fk";
            columns: ["completed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_created_by_profile_fk";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_instance_fk";
            columns: [
              "checklist_instance_id",
              "organization_id",
              "location_id",
            ];
            isOneToOne: false;
            referencedRelation: "checklist_instances";
            referencedColumns: ["id", "organization_id", "location_id"];
          },
          {
            foreignKeyName: "tasks_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "tasks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_recurrence_fk";
            columns: ["recurrence_rule_id", "organization_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "task_recurrence_rules";
            referencedColumns: ["id", "organization_id", "location_id"];
          },
          {
            foreignKeyName: "tasks_started_by_profile_fk";
            columns: ["started_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_template_item_id_fkey";
            columns: ["template_item_id"];
            isOneToOne: false;
            referencedRelation: "checklist_template_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_updated_by_profile_fk";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      time_off_requests: {
        Row: {
          created_at: string;
          ends_at: string;
          id: number;
          note: string | null;
          organization_id: string;
          profile_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          starts_at: string;
          status: Database["public"]["Enums"]["request_status"];
        };
        Insert: {
          created_at?: string;
          ends_at: string;
          id?: never;
          note?: string | null;
          organization_id: string;
          profile_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          starts_at: string;
          status?: Database["public"]["Enums"]["request_status"];
        };
        Update: {
          created_at?: string;
          ends_at?: string;
          id?: never;
          note?: string | null;
          organization_id?: string;
          profile_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          starts_at?: string;
          status?: Database["public"]["Enums"]["request_status"];
        };
        Relationships: [
          {
            foreignKeyName: "time_off_member_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "time_off_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_off_requests_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_off_requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_off_reviewer_member_fk";
            columns: ["organization_id", "reviewed_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
      tip_allocations: {
        Row: {
          amount_cents: number;
          calculated_at: string;
          id: number;
          organization_id: string;
          profile_id: string;
          tip_pool_id: number;
        };
        Insert: {
          amount_cents: number;
          calculated_at?: string;
          id?: never;
          organization_id: string;
          profile_id: string;
          tip_pool_id: number;
        };
        Update: {
          amount_cents?: number;
          calculated_at?: string;
          id?: never;
          organization_id?: string;
          profile_id?: string;
          tip_pool_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tip_allocations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tip_allocations_organization_id_profile_id_fkey";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "tip_allocations_tip_pool_id_organization_id_fkey";
            columns: ["tip_pool_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "tip_pools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      tip_interval_participants: {
        Row: {
          created_at: string;
          organization_id: string;
          profile_id: string;
          tip_interval_id: number;
        };
        Insert: {
          created_at?: string;
          organization_id: string;
          profile_id: string;
          tip_interval_id: number;
        };
        Update: {
          created_at?: string;
          organization_id?: string;
          profile_id?: string;
          tip_interval_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tip_interval_participants_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tip_interval_participants_organization_id_profile_id_fkey";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "tip_interval_participants_tip_interval_id_organization_id_fkey";
            columns: ["tip_interval_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "tip_intervals";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      tip_intervals: {
        Row: {
          amount_cents: number;
          created_at: string;
          ends_at: string;
          id: number;
          note: string | null;
          organization_id: string;
          starts_at: string;
          tip_pool_id: number;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          ends_at: string;
          id?: never;
          note?: string | null;
          organization_id: string;
          starts_at: string;
          tip_pool_id: number;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          ends_at?: string;
          id?: never;
          note?: string | null;
          organization_id?: string;
          starts_at?: string;
          tip_pool_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tip_intervals_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tip_intervals_tip_pool_id_organization_id_fkey";
            columns: ["tip_pool_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "tip_pools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      tip_pools: {
        Row: {
          created_at: string;
          finalized_at: string | null;
          finalized_by: string | null;
          id: number;
          location_id: string;
          organization_id: string;
          service_date: string;
          status: Database["public"]["Enums"]["tip_pool_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          finalized_at?: string | null;
          finalized_by?: string | null;
          id?: never;
          location_id: string;
          organization_id: string;
          service_date: string;
          status?: Database["public"]["Enums"]["tip_pool_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          finalized_at?: string | null;
          finalized_by?: string | null;
          id?: never;
          location_id?: string;
          organization_id?: string;
          service_date?: string;
          status?: Database["public"]["Enums"]["tip_pool_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tip_pools_finalized_by_profile_fk";
            columns: ["finalized_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tip_pools_location_id_organization_id_fkey";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "tip_pools_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      attendance_session_summaries: {
        Row: {
          break_count: number | null;
          break_policy_resolved: boolean | null;
          clock_in_at: string | null;
          clock_out_at: string | null;
          correction_count: number | null;
          gross_elapsed_seconds: number | null;
          is_closed: boolean | null;
          last_corrected_at: string | null;
          location_id: string | null;
          net_payable_seconds: number | null;
          open_break_count: number | null;
          organization_id: string | null;
          paid_break_seconds: number | null;
          profile_id: string | null;
          service_date: string | null;
          session_id: string | null;
          status:
            | Database["public"]["Enums"]["attendance_session_status"]
            | null;
          total_break_seconds: number | null;
          unclassified_break_seconds: number | null;
          unpaid_break_seconds: number | null;
          version: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_location_tenant_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "attendance_sessions_membership_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
          {
            foreignKeyName: "attendance_sessions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_sessions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_stock_status: {
        Row: {
          backup: number | null;
          cutoff: number | null;
          effective_warning: number | null;
          last_adjusted_at: string | null;
          location_id: string | null;
          on_hand: number | null;
          order_needed: boolean | null;
          organization_id: string | null;
          par: number | null;
          product_active: boolean | null;
          product_id: string | null;
          status: string | null;
          suggested_order: number | null;
          total: number | null;
          updated_at: string | null;
          updated_by: string | null;
          version: number | null;
          warning: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_stock_location_fk";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_stock_product_fk";
            columns: ["product_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_products";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_stock_updater_fk";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_attendance_consumption_staleness: {
        Row: {
          consumed_net_seconds: number | null;
          consumed_version: number | null;
          consumption_id: number | null;
          current_version: number | null;
          location_id: string | null;
          organization_id: string | null;
          period_frozen: boolean | null;
          period_id: number | null;
          period_month: string | null;
          profile_id: string | null;
          session_id: string | null;
          session_voided: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_attendance_consumptions_period_fk";
            columns: [
              "period_id",
              "organization_id",
              "profile_id",
              "period_month",
            ];
            isOneToOne: false;
            referencedRelation: "payroll_native_period_reconciliation";
            referencedColumns: [
              "period_id",
              "organization_id",
              "profile_id",
              "period_month",
            ];
          },
          {
            foreignKeyName: "payroll_attendance_consumptions_period_fk";
            columns: [
              "period_id",
              "organization_id",
              "profile_id",
              "period_month",
            ];
            isOneToOne: false;
            referencedRelation: "payroll_periods";
            referencedColumns: [
              "id",
              "organization_id",
              "profile_id",
              "period_month",
            ];
          },
          {
            foreignKeyName: "payroll_attendance_consumptions_session_fk";
            columns: [
              "session_id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
            isOneToOne: false;
            referencedRelation: "attendance_session_summaries";
            referencedColumns: [
              "session_id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
          },
          {
            foreignKeyName: "payroll_attendance_consumptions_session_fk";
            columns: [
              "session_id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
            isOneToOne: false;
            referencedRelation: "attendance_sessions";
            referencedColumns: [
              "id",
              "organization_id",
              "location_id",
              "profile_id",
            ];
          },
        ];
      };
      payroll_native_period_reconciliation: {
        Row: {
          active_rows: number | null;
          hours_snapshot: number | null;
          ledger_seconds: number | null;
          organization_id: string | null;
          period_id: number | null;
          period_month: string | null;
          profile_id: string | null;
          reconciles: boolean | null;
          status: string | null;
          superseded_rows: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_periods_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_periods_profile_membership_fk";
            columns: ["organization_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
        ];
      };
    };
    Functions: {
      apply_location_assignment_changes: {
        Args: { p_changes: Json; p_target_profile_id: string };
        Returns: {
          active: boolean;
          created_at: string;
          id: number;
          location_id: string;
          profile_id: string;
          role: Database["public"]["Enums"]["location_role"];
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "location_memberships";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      attendance_break_end: {
        Args: {
          p_idempotency_key?: string;
          p_location_id: string;
          p_profile_id?: string;
        };
        Returns: Json;
      };
      attendance_break_start: {
        Args: {
          p_idempotency_key?: string;
          p_location_id: string;
          p_profile_id?: string;
        };
        Returns: Json;
      };
      attendance_can_manage: {
        Args: { p_location_id: string };
        Returns: boolean;
      };
      attendance_clock_in: {
        Args: {
          p_idempotency_key?: string;
          p_location_id: string;
          p_notes?: string;
          p_profile_id?: string;
        };
        Returns: Json;
      };
      attendance_clock_out: {
        Args: {
          p_idempotency_key?: string;
          p_location_id: string;
          p_notes?: string;
          p_profile_id?: string;
        };
        Returns: Json;
      };
      attendance_correct_session: {
        Args: {
          p_breaks?: Json;
          p_clock_in_at?: string;
          p_clock_out_at?: string;
          p_expected_version: number;
          p_idempotency_key?: string;
          p_reason: string;
          p_session_id: string;
          p_void?: boolean;
        };
        Returns: Json;
      };
      attendance_manual_entry: {
        Args: {
          p_clock_in_at: string;
          p_clock_out_at?: string | null;
          p_idempotency_key: string;
          p_location_id: string;
          p_profile_id: string;
          p_reason: string;
          p_service_date: string;
        };
        Returns: Json;
      };
      bar_recipe_category_reorder: {
        Args: { p_ordered_ids: string[]; p_organization_id: string };
        Returns: Json;
      };
      bar_recipe_category_save: {
        Args: {
          p_category_id: string;
          p_expected_version: number;
          p_name: string;
          p_organization_id: string;
        };
        Returns: Json;
      };
      bar_recipe_category_set_active: {
        Args: {
          p_active: boolean;
          p_category_id: string;
          p_expected_version: number;
          p_organization_id: string;
        };
        Returns: Json;
      };
      bar_recipe_save: {
        Args: {
          p_expected_version: number;
          p_organization_id: string;
          p_payload: Json;
          p_recipe_id: string;
        };
        Returns: Json;
      };
      bar_recipe_set_archived: {
        Args: {
          p_archived: boolean;
          p_category_id?: string;
          p_expected_version: number;
          p_organization_id: string;
          p_recipe_id: string;
        };
        Returns: Json;
      };
      bar_recipe_set_image: {
        Args: {
          p_expected_version: number;
          p_image_path: string;
          p_organization_id: string;
          p_recipe_id: string;
          p_thumb_path: string;
        };
        Returns: Json;
      };
      bar_recipes_import: {
        Args: {
          p_actor_profile_id: string;
          p_mode: string;
          p_organization_id: string;
          p_overwrite?: number[];
          p_payload: Json;
        };
        Returns: Json;
      };
      board_add_column: {
        Args: {
          p_location_id: string;
          p_organization_id: string;
          p_server_profile_id: string;
          p_service_date: string;
        };
        Returns: number;
      };
      board_add_row: {
        Args: { p_organization_id: string; p_service_session_id: number };
        Returns: number;
      };
      board_assign: {
        Args: {
          p_confirm_transfer?: boolean;
          p_end_whole_assignment?: boolean;
          p_location_id: string;
          p_member_id: number;
          p_organization_id: string;
          p_round_id: number;
          p_service_date: string;
          p_table_label: string;
        };
        Returns: number;
      };
      board_clear_board: {
        Args: { p_organization_id: string; p_service_session_id: number };
        Returns: undefined;
      };
      board_clear_cell: {
        Args: {
          p_member_id: number;
          p_organization_id: string;
          p_round_id: number;
          p_service_session_id: number;
        };
        Returns: undefined;
      };
      board_clear_column: {
        Args: {
          p_member_id: number;
          p_organization_id: string;
          p_service_session_id: number;
        };
        Returns: undefined;
      };
      board_clear_row: {
        Args: {
          p_organization_id: string;
          p_round_id: number;
          p_service_session_id: number;
        };
        Returns: undefined;
      };
      board_delete_row: {
        Args: {
          p_organization_id: string;
          p_round_id: number;
          p_service_session_id: number;
        };
        Returns: undefined;
      };
      board_end_and_assign: {
        Args: {
          p_end_round_ids: number[];
          p_member_id: number;
          p_organization_id: string;
          p_service_session_id: number;
          p_table_label: string;
        };
        Returns: number;
      };
      board_end_previous_and_assign: {
        Args: {
          p_confirm_transfer?: boolean;
          p_end_whole_assignment?: boolean;
          p_location_id: string;
          p_member_id: number;
          p_organization_id: string;
          p_round_id: number;
          p_service_date: string;
          p_table_label: string;
        };
        Returns: number;
      };
      board_end_table: {
        Args: {
          p_member_id: number;
          p_organization_id: string;
          p_round_id: number;
          p_service_session_id: number;
        };
        Returns: undefined;
      };
      board_location_roster: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: {
          active: boolean;
          display_name: string;
          profile_id: string;
          roles: Database["public"]["Enums"]["app_role"][];
        }[];
      };
      board_move_column: {
        Args: {
          p_direction: string;
          p_member_id: number;
          p_organization_id: string;
          p_service_session_id: number;
        };
        Returns: undefined;
      };
      board_redo: {
        Args: { p_organization_id: string; p_service_session_id: number };
        Returns: undefined;
      };
      board_set_column_status: {
        Args: {
          p_member_id: number;
          p_organization_id: string;
          p_service_session_id: number;
          p_status: string;
        };
        Returns: undefined;
      };
      board_skip_turn: {
        Args: {
          p_location_id: string;
          p_member_id: number;
          p_organization_id: string;
          p_round_id: number;
          p_service_date: string;
        };
        Returns: number;
      };
      board_transfer: {
        Args: {
          p_dest_member_id: number;
          p_organization_id: string;
          p_service_session_id: number;
          p_source_member_id: number;
          p_source_round_id: number;
        };
        Returns: number;
      };
      board_undo: {
        Args: { p_organization_id: string; p_service_session_id: number };
        Returns: undefined;
      };
      catalog_authorized: {
        Args: { p_organization_id: string };
        Returns: boolean;
      };
      checklist_generate_daily: {
        Args: {
          p_kind?: Database["public"]["Enums"]["checklist_kind"];
          p_location_id: string;
          p_organization_id: string;
          p_service_date?: string;
        };
        Returns: string[];
      };
      checklist_template_save: {
        Args: {
          p_active: boolean;
          p_days_of_week: number[];
          p_items: Json;
          p_kind: Database["public"]["Enums"]["checklist_kind"];
          p_location_id: string;
          p_name: string;
          p_organization_id: string;
          p_template_id: string;
        };
        Returns: string;
      };
      checklist_template_set_active: {
        Args: { p_active: boolean; p_template_id: string };
        Returns: undefined;
      };
      get_location_lifecycle_readiness: {
        Args: { p_location_id: string };
        Returns: Json;
      };
      inventory_bootstrap: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: string;
      };
      inventory_bulk_count: {
        Args: {
          p_location_id: string;
          p_note: string;
          p_organization_id: string;
          p_reason: string;
          p_rows: Json;
        };
        Returns: Json;
      };
      inventory_category_create: {
        Args: {
          p_location_id: string;
          p_name: string;
          p_organization_id: string;
        };
        Returns: string;
      };
      inventory_category_set_active: {
        Args: {
          p_active: boolean;
          p_category_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
        };
        Returns: number;
      };
      inventory_category_update: {
        Args: {
          p_category_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_name: string;
          p_organization_id: string;
        };
        Returns: number;
      };
      inventory_date_group_import_commit: {
        Args: {
          p_filename: string;
          p_fingerprint: string;
          p_location_id: string;
          p_organization_id: string;
          p_rejected: number;
          p_request_id: string;
          p_rows: Json;
          p_skipped: number;
        };
        Returns: Json;
      };
      inventory_date_lot_save: {
        Args: {
          p_active: boolean;
          p_expected_version: number;
          p_expiration_date: string;
          p_expiration_precision: string;
          p_id: string;
          p_location_id: string;
          p_manufacture_date: string;
          p_manufacture_precision: string;
          p_notes: string;
          p_organization_id: string;
          p_product_id: string;
          p_quantity: number;
        };
        Returns: string;
      };
      inventory_freshness_rule_save: {
        Args: {
          p_active: boolean;
          p_expected_version: number;
          p_id: string;
          p_location_id: string;
          p_maximum_months: number;
          p_organization_id: string;
          p_subcategory_id: string;
          p_tracking_enabled: boolean;
          p_warning_months: number;
        };
        Returns: string;
      };
      inventory_import_commit: {
        Args: {
          p_batch_id: string;
          p_location_id: string;
          p_organization_id: string;
        };
        Returns: Json;
      };
      inventory_import_stage: {
        Args: {
          p_filename: string;
          p_format: string;
          p_location_id: string;
          p_organization_id: string;
          p_plan: Json;
          p_reason: string;
          p_request_id: string;
          p_sheet: string;
        };
        Returns: string;
      };
      inventory_location_authorized: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: boolean;
      };
      inventory_order_draft_clear: {
        Args: {
          p_draft_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
        };
        Returns: Json;
      };
      inventory_order_draft_fill: {
        Args: {
          p_draft_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_mode: string;
          p_organization_id: string;
        };
        Returns: Json;
      };
      inventory_order_draft_mark_sent: {
        Args: {
          p_draft_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
        };
        Returns: Json;
      };
      inventory_order_draft_open: {
        Args: {
          p_location_id: string;
          p_organization_id: string;
          p_vendor_id: string;
        };
        Returns: string;
      };
      inventory_order_draft_save: {
        Args: {
          p_draft_id: string;
          p_expected_version: number;
          p_lines: Json;
          p_location_id: string;
          p_organization_id: string;
          p_vendor_note: string;
        };
        Returns: Json;
      };
      inventory_order_draft_sync: {
        Args: {
          p_draft_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
        };
        Returns: Json;
      };
      inventory_product_create: {
        Args: {
          p_category_id: string;
          p_location_id: string;
          p_name: string;
          p_notes: string;
          p_organization_id: string;
          p_size: string;
          p_sku: string;
          p_subcategory_id: string;
          p_unit_label: string;
          p_unit_type: string;
          p_vendor_id: string;
        };
        Returns: string;
      };
      inventory_product_set_active: {
        Args: {
          p_active: boolean;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
          p_product_id: string;
        };
        Returns: number;
      };
      inventory_product_update: {
        Args: {
          p_category_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_name: string;
          p_notes: string;
          p_organization_id: string;
          p_product_id: string;
          p_size: string;
          p_sku: string;
          p_subcategory_id: string;
          p_unit_label: string;
          p_unit_type: string;
          p_vendor_id: string;
        };
        Returns: number;
      };
      inventory_saved_view_delete: {
        Args: {
          p_expected_version: number;
          p_id: string;
          p_location_id: string;
          p_organization_id: string;
        };
        Returns: undefined;
      };
      inventory_saved_view_save: {
        Args: {
          p_expected_version: number;
          p_id: string;
          p_is_default: boolean;
          p_location_id: string;
          p_name: string;
          p_organization_id: string;
          p_payload: Json;
        };
        Returns: string;
      };
      inventory_stock_adjust: {
        Args: {
          p_backup: number;
          p_expected_version: number;
          p_location_id: string;
          p_mode: string;
          p_note: string;
          p_on_hand: number;
          p_organization_id: string;
          p_product_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      inventory_stock_set_levels: {
        Args: {
          p_cutoff: number;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
          p_par: number;
          p_product_id: string;
          p_warning: number;
        };
        Returns: number;
      };
      inventory_storage_area_archive: {
        Args: {
          p_area_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
        };
        Returns: undefined;
      };
      inventory_storage_area_upsert: {
        Args: {
          p_active: boolean;
          p_area_id: string;
          p_display_order: number;
          p_expected_version: number;
          p_kind: string;
          p_location_id: string;
          p_name: string;
          p_organization_id: string;
        };
        Returns: string;
      };
      inventory_storage_placement_delete: {
        Args: {
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
          p_placement_id: string;
        };
        Returns: undefined;
      };
      inventory_storage_placement_reorder: {
        Args: {
          p_location_id: string;
          p_organization_id: string;
          p_placement_ids: string[];
          p_shelf_id: string;
        };
        Returns: undefined;
      };
      inventory_storage_placement_set: {
        Args: {
          p_display_order: number;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
          p_placement_id: string;
          p_product_id: string;
          p_shelf_id: string;
          p_slot_label: string;
          p_slot_number: number;
          p_storage_area_id: string;
        };
        Returns: string;
      };
      inventory_storage_shelf_delete: {
        Args: {
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
          p_remove_placements: boolean;
          p_shelf_id: string;
        };
        Returns: number;
      };
      inventory_storage_shelf_upsert: {
        Args: {
          p_display_order: number;
          p_expected_version: number;
          p_location_id: string;
          p_name: string;
          p_organization_id: string;
          p_section_name: string;
          p_shelf_id: string;
          p_storage_area_id: string;
        };
        Returns: string;
      };
      inventory_subcategory_create: {
        Args: {
          p_category_id: string;
          p_location_id: string;
          p_name: string;
          p_organization_id: string;
        };
        Returns: string;
      };
      inventory_subcategory_set_active: {
        Args: {
          p_active: boolean;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
          p_subcategory_id: string;
        };
        Returns: number;
      };
      inventory_subcategory_update: {
        Args: {
          p_category_id: string;
          p_expected_version: number;
          p_location_id: string;
          p_name: string;
          p_organization_id: string;
          p_subcategory_id: string;
        };
        Returns: number;
      };
      inventory_vendor_create: {
        Args: {
          p_location_id: string;
          p_name: string;
          p_notes: string;
          p_organization_id: string;
        };
        Returns: string;
      };
      inventory_vendor_set_active: {
        Args: {
          p_active: boolean;
          p_expected_version: number;
          p_location_id: string;
          p_organization_id: string;
          p_vendor_id: string;
        };
        Returns: number;
      };
      inventory_vendor_update: {
        Args: {
          p_expected_version: number;
          p_location_id: string;
          p_name: string;
          p_notes: string;
          p_organization_id: string;
          p_vendor_id: string;
        };
        Returns: number;
      };
      kiosk_consume_pairing_code: {
        Args: {
          p_client_identifier?: string;
          p_code_hash: string;
          p_device_token_hash: string;
        };
        Returns: Json;
      };
      kiosk_generate_pairing_code: {
        Args: {
          p_code_hash: string;
          p_device_name: string;
          p_location_id: string;
        };
        Returns: Json;
      };
      kiosk_list_manageable_locations: {
        Args: never;
        Returns: {
          location_id: string;
          location_name: string;
          organization_id: string;
          organization_name: string;
        }[];
      };
      kiosk_reassign_device: {
        Args: { p_device_id: string; p_new_location_id: string };
        Returns: Json;
      };
      kiosk_record_pairing_failure: {
        Args: { p_client_identifier?: string; p_code_hash: string };
        Returns: Json;
      };
      kiosk_rename_device: {
        Args: { p_device_id: string; p_name: string };
        Returns: Json;
      };
      kiosk_revoke_device: {
        Args: { p_device_id: string; p_reason?: string };
        Returns: Json;
      };
      list_organization_staff: {
        Args: {
          p_limit?: number;
          p_offset?: number;
          p_organization_id: string;
          p_profile_id?: string;
        };
        Returns: {
          active: boolean;
          display_name: string;
          profile_id: string;
          roles: Database["public"]["Enums"]["app_role"][];
        }[];
      };
      payroll_generate_native_period: {
        Args: {
          p_organization_id: string;
          p_period_month: string;
          p_profile_id: string;
        };
        Returns: Json;
      };
      payroll_location_authorized: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: boolean;
      };
      payroll_raise_consumption_reviews: {
        Args: { p_organization_id: string };
        Returns: number;
      };
      payroll_resolve_consumption_review: {
        Args: {
          p_decision: string;
          p_note: string;
          p_payroll_adjustment_id?: number;
          p_review_id: number;
        };
        Returns: Json;
      };
      payroll_source_transition_readiness: {
        Args: {
          p_location_id: string;
          p_target_mode: Database["public"]["Enums"]["attendance_mode"];
        };
        Returns: Json;
      };
      provision_location: {
        Args: {
          p_address?: Json;
          p_closing_local?: string;
          p_cover_weight?: number;
          p_name: string;
          p_opening_local?: string;
          p_organization_id: string;
          p_time_zone?: string;
        };
        Returns: {
          active: boolean;
          address: Json;
          archived_at: string | null;
          attendance_mode:
            | Database["public"]["Enums"]["attendance_mode"]
            | null;
          closing_local: string;
          cover_weight: number;
          created_at: string;
          id: string;
          name: string;
          opening_local: string;
          organization_id: string;
          time_zone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "locations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      provision_organization: {
        Args: {
          p_initial_owner_profile_id?: string;
          p_name: string;
          p_settings?: Json;
          p_slug: string;
        };
        Returns: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          settings: Json;
          slug: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "organizations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      recalculate_tip_pool: {
        Args: { target_tip_pool_id: number };
        Returns: undefined;
      };
      recipes_org_authorized: {
        Args: { p_organization_id: string };
        Returns: boolean;
      };
      schedule_location_authorized: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: boolean;
      };
      schedule_location_roster: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: {
          active: boolean;
          display_name: string;
          eligible: boolean;
          profile_id: string;
          roles: Database["public"]["Enums"]["app_role"][];
        }[];
      };
      set_location_attendance_mode: {
        Args: {
          p_expected_updated_at?: string;
          p_location_id: string;
          p_mode: Database["public"]["Enums"]["attendance_mode"];
          p_reason?: string;
        };
        Returns: {
          active: boolean;
          address: Json;
          archived_at: string | null;
          attendance_mode:
            | Database["public"]["Enums"]["attendance_mode"]
            | null;
          closing_local: string;
          cover_weight: number;
          created_at: string;
          id: string;
          name: string;
          opening_local: string;
          organization_id: string;
          time_zone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "locations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      task_assign: {
        Args: {
          p_assignee_ids: string[];
          p_assignment_mode: Database["public"]["Enums"]["task_assignment_mode"];
          p_task_id: string;
        };
        Returns: undefined;
      };
      task_cancel: {
        Args: { p_reason?: string; p_task_id: string };
        Returns: undefined;
      };
      task_carry_forward: {
        Args: { p_new_due_date: string; p_task_ids: string[] };
        Returns: number;
      };
      task_complete: {
        Args: { p_note?: string; p_task_id: string };
        Returns: undefined;
      };
      task_create: {
        Args: {
          p_assignee_ids: string[];
          p_assignment_mode: Database["public"]["Enums"]["task_assignment_mode"];
          p_category: string;
          p_due_date: string;
          p_due_time: string;
          p_due_window: Database["public"]["Enums"]["task_due_window"];
          p_each_person: boolean;
          p_instructions: string;
          p_location_id: string;
          p_organization_id: string;
          p_priority: Database["public"]["Enums"]["task_priority"];
          p_start_date: string;
          p_title: string;
        };
        Returns: string[];
      };
      task_notifications_mark_location_read: {
        Args: {
          p_ids?: number[];
          p_location_id: string;
          p_organization_id: string;
        };
        Returns: number;
      };
      task_notifications_mark_read: {
        Args: { p_ids?: number[] };
        Returns: number;
      };
      task_notifications_sweep: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: number;
      };
      task_opening_reminders_sweep: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: number;
      };
      task_recurrence_generate: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: number;
      };
      task_reopen: { Args: { p_task_id: string }; Returns: undefined };
      task_series_create: {
        Args: {
          p_assignee_ids: string[];
          p_assignment_mode: Database["public"]["Enums"]["task_assignment_mode"];
          p_category: string;
          p_day_of_month: number;
          p_due_time: string;
          p_due_window: Database["public"]["Enums"]["task_due_window"];
          p_end_type: Database["public"]["Enums"]["recurrence_end_type"];
          p_ends_on: string;
          p_frequency: Database["public"]["Enums"]["recurrence_frequency"];
          p_instructions: string;
          p_location_id: string;
          p_max_occurrences: number;
          p_organization_id: string;
          p_priority: Database["public"]["Enums"]["task_priority"];
          p_starts_on: string;
          p_title: string;
          p_weekdays: number[];
        };
        Returns: string;
      };
      task_series_stop: { Args: { p_rule_id: string }; Returns: number };
      task_series_update: {
        Args: {
          p_assignee_ids: string[];
          p_assignment_mode: Database["public"]["Enums"]["task_assignment_mode"];
          p_category: string;
          p_day_of_month: number;
          p_due_time: string;
          p_due_window: Database["public"]["Enums"]["task_due_window"];
          p_end_type: Database["public"]["Enums"]["recurrence_end_type"];
          p_ends_on: string;
          p_frequency: Database["public"]["Enums"]["recurrence_frequency"];
          p_instructions: string;
          p_max_occurrences: number;
          p_priority: Database["public"]["Enums"]["task_priority"];
          p_rule_id: string;
          p_starts_on: string;
          p_title: string;
          p_weekdays: number[];
        };
        Returns: undefined;
      };
      task_set_status: {
        Args: {
          p_reason?: string;
          p_status: Database["public"]["Enums"]["task_status"];
          p_task_id: string;
        };
        Returns: undefined;
      };
      task_update: {
        Args: {
          p_category: string;
          p_due_date: string;
          p_due_time: string;
          p_due_window: Database["public"]["Enums"]["task_due_window"];
          p_instructions: string;
          p_priority: Database["public"]["Enums"]["task_priority"];
          p_start_date: string;
          p_task_id: string;
          p_title: string;
        };
        Returns: undefined;
      };
      tasks_location_authorized: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: boolean;
      };
      tasks_location_people: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: {
          designation: string;
          display_name: string;
          eligible: boolean;
          profile_id: string;
        }[];
      };
      tips_add_interval: {
        Args: {
          p_amount_cents: number;
          p_ends_at: string;
          p_location_id: string;
          p_organization_id: string;
          p_participant_ids: string[];
          p_service_date: string;
          p_starts_at: string;
        };
        Returns: Json;
      };
      tips_finalize_pool: {
        Args: {
          p_location_id: string;
          p_organization_id: string;
          p_tip_pool_id: number;
        };
        Returns: undefined;
      };
      tips_get_day_data: {
        Args: {
          p_location_id: string;
          p_organization_id: string;
          p_service_date: string;
        };
        Returns: Json;
      };
      tips_location_authorized: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: boolean;
      };
      tips_location_roster: {
        Args: { p_location_id: string; p_organization_id: string };
        Returns: {
          active: boolean;
          display_name: string;
          eligible: boolean;
          profile_id: string;
          roles: Database["public"]["Enums"]["app_role"][];
        }[];
      };
      tips_reopen_pool: {
        Args: {
          p_location_id: string;
          p_organization_id: string;
          p_reason: string;
          p_tip_pool_id: number;
        };
        Returns: undefined;
      };
      transition_location_lifecycle: {
        Args: {
          p_action: string;
          p_expected_status?: string;
          p_location_id: string;
          p_reason: string;
        };
        Returns: {
          active: boolean;
          address: Json;
          archived_at: string | null;
          attendance_mode:
            | Database["public"]["Enums"]["attendance_mode"]
            | null;
          closing_local: string;
          cover_weight: number;
          created_at: string;
          id: string;
          name: string;
          opening_local: string;
          organization_id: string;
          time_zone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "locations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      unconfirm_payroll_payment: {
        Args: { p_payment_id: number; p_reason: string };
        Returns: undefined;
      };
    };
    Enums: {
      access_request_status: "pending" | "approved" | "declined";
      app_role:
        | "owner"
        | "general_manager"
        | "shift_manager"
        | "host"
        | "server";
      attendance_break_pay_classification: "unclassified" | "paid" | "unpaid";
      attendance_event_source: "web" | "kiosk" | "manager" | "system";
      attendance_event_type:
        | "clock_in"
        | "clock_out"
        | "break_start"
        | "break_end"
        | "manager_edit"
        | "void";
      attendance_mode: "external" | "internal_the_lineup" | "disabled";
      attendance_session_status:
        | "active"
        | "on_break"
        | "completed"
        | "auto_clocked_out"
        | "voided";
      board_event_type:
        | "assign"
        | "add_column"
        | "pause_column"
        | "resume_column"
        | "remove_column"
        | "clear_row"
        | "clear_column"
        | "clear_board"
        | "undo"
        | "redo"
        | "move_column"
        | "add_row"
        | "clear_cell"
        | "delete_row"
        | "transfer"
        | "end"
        | "skip"
        | "end_and_assign";
      checklist_kind: "opening" | "closing";
      location_module_key:
        | "table_allocation"
        | "tasks"
        | "schedule"
        | "tips"
        | "team"
        | "attendance"
        | "payroll"
        | "bar_inventory"
        | "recipes";
      location_role: "manager" | "assistant_manager" | "staff";
      overall_role: "owner" | "manager" | "assistant_manager";
      recurrence_end_type: "never" | "on_date" | "after_count";
      recurrence_frequency:
        | "daily"
        | "weekdays"
        | "weekly"
        | "selected_weekdays"
        | "monthly";
      request_status: "pending" | "approved" | "declined" | "cancelled";
      rotation_status: "active" | "paused" | "closing" | "unavailable";
      schedule_status: "draft" | "published" | "archived";
      seating_status: "seated" | "closed" | "cancelled" | "transferred";
      service_status: "planned" | "active" | "closed";
      shift_kind: "morning" | "evening" | "full_day";
      task_assignment_mode: "individual" | "multiple" | "all_team" | "anyone";
      task_due_window:
        | "before_opening"
        | "during_shift"
        | "before_dinner"
        | "closing"
        | "end_of_night";
      task_event_type:
        | "created"
        | "assigned"
        | "reassigned"
        | "edited"
        | "started"
        | "blocked"
        | "unblocked"
        | "completed"
        | "reopened"
        | "cancelled"
        | "carried_forward"
        | "recurrence_created"
        | "recurrence_changed"
        | "checklist_generated";
      task_kind: "task" | "opening" | "closing";
      task_notification_type:
        | "assigned"
        | "reassigned"
        | "due_soon"
        | "overdue"
        | "completed"
        | "checklist_available"
        | "opening_reminder";
      task_priority: "normal" | "high" | "urgent";
      task_status:
        | "open"
        | "in_progress"
        | "blocked"
        | "completed"
        | "cancelled";
      tip_pool_status: "draft" | "finalized";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      access_request_status: ["pending", "approved", "declined"],
      app_role: ["owner", "general_manager", "shift_manager", "host", "server"],
      attendance_break_pay_classification: ["unclassified", "paid", "unpaid"],
      attendance_event_source: ["web", "kiosk", "manager", "system"],
      attendance_event_type: [
        "clock_in",
        "clock_out",
        "break_start",
        "break_end",
        "manager_edit",
        "void",
      ],
      attendance_mode: ["external", "internal_the_lineup", "disabled"],
      attendance_session_status: [
        "active",
        "on_break",
        "completed",
        "auto_clocked_out",
        "voided",
      ],
      board_event_type: [
        "assign",
        "add_column",
        "pause_column",
        "resume_column",
        "remove_column",
        "clear_row",
        "clear_column",
        "clear_board",
        "undo",
        "redo",
        "move_column",
        "add_row",
        "clear_cell",
        "delete_row",
        "transfer",
        "end",
        "skip",
        "end_and_assign",
      ],
      checklist_kind: ["opening", "closing"],
      location_module_key: [
        "table_allocation",
        "tasks",
        "schedule",
        "tips",
        "team",
        "attendance",
        "payroll",
        "bar_inventory",
        "recipes",
      ],
      location_role: ["manager", "assistant_manager", "staff"],
      overall_role: ["owner", "manager", "assistant_manager"],
      recurrence_end_type: ["never", "on_date", "after_count"],
      recurrence_frequency: [
        "daily",
        "weekdays",
        "weekly",
        "selected_weekdays",
        "monthly",
      ],
      request_status: ["pending", "approved", "declined", "cancelled"],
      rotation_status: ["active", "paused", "closing", "unavailable"],
      schedule_status: ["draft", "published", "archived"],
      seating_status: ["seated", "closed", "cancelled", "transferred"],
      service_status: ["planned", "active", "closed"],
      shift_kind: ["morning", "evening", "full_day"],
      task_assignment_mode: ["individual", "multiple", "all_team", "anyone"],
      task_due_window: [
        "before_opening",
        "during_shift",
        "before_dinner",
        "closing",
        "end_of_night",
      ],
      task_event_type: [
        "created",
        "assigned",
        "reassigned",
        "edited",
        "started",
        "blocked",
        "unblocked",
        "completed",
        "reopened",
        "cancelled",
        "carried_forward",
        "recurrence_created",
        "recurrence_changed",
        "checklist_generated",
      ],
      task_kind: ["task", "opening", "closing"],
      task_notification_type: [
        "assigned",
        "reassigned",
        "due_soon",
        "overdue",
        "completed",
        "checklist_available",
        "opening_reminder",
      ],
      task_priority: ["normal", "high", "urgent"],
      task_status: ["open", "in_progress", "blocked", "completed", "cancelled"],
      tip_pool_status: ["draft", "finalized"],
    },
  },
} as const;
