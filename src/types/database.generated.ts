export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
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
            foreignKeyName: "audit_events_actor_member_fk";
            columns: ["organization_id", "actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
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
            foreignKeyName: "board_events_organization_id_actor_profile_id_fkey";
            columns: ["organization_id", "actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
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
      locations: {
        Row: {
          active: boolean;
          address: Json;
          closing_local: string;
          cover_weight: number;
          created_at: string;
          id: string;
          name: string;
          opening_local: string;
          organization_id: string;
          time_zone: string;
        };
        Insert: {
          active?: boolean;
          address?: Json;
          closing_local?: string;
          cover_weight?: number;
          created_at?: string;
          id?: string;
          name: string;
          opening_local?: string;
          organization_id: string;
          time_zone?: string;
        };
        Update: {
          active?: boolean;
          address?: Json;
          closing_local?: string;
          cover_weight?: number;
          created_at?: string;
          id?: string;
          name?: string;
          opening_local?: string;
          organization_id?: string;
          time_zone?: string;
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
          {
            foreignKeyName: "schedule_publisher_member_fk";
            columns: ["organization_id", "published_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
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
          locked: boolean;
          organization_id: string;
          server_profile_id: string | null;
          service_session_id: number;
        };
        Insert: {
          created_at?: string;
          dining_table_id: number;
          id?: never;
          locked?: boolean;
          organization_id: string;
          server_profile_id?: string | null;
          service_session_id: number;
        };
        Update: {
          created_at?: string;
          dining_table_id?: number;
          id?: never;
          locked?: boolean;
          organization_id?: string;
          server_profile_id?: string | null;
          service_session_id?: number;
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
            foreignKeyName: "section_assignments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
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
            foreignKeyName: "section_assignments_session_tenant_fk";
            columns: ["service_session_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "service_sessions";
            referencedColumns: ["id", "organization_id"];
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
            foreignKeyName: "service_closed_by_member_fk";
            columns: ["organization_id", "closed_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
          },
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
          {
            foreignKeyName: "service_started_by_member_fk";
            columns: ["organization_id", "started_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
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
          id: number;
          organization_id: string;
          rotation_member_id: number;
          rotation_round_id: number;
          table_label: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by: string;
          id?: never;
          organization_id: string;
          rotation_member_id: number;
          rotation_round_id: number;
          table_label: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string;
          id?: never;
          organization_id?: string;
          rotation_member_id?: number;
          rotation_round_id?: number;
          table_label?: string;
        };
        Relationships: [
          {
            foreignKeyName: "table_rotation_entries_organization_id_assigned_by_fkey";
            columns: ["organization_id", "assigned_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
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
            foreignKeyName: "tip_pools_location_id_organization_id_fkey";
            columns: ["location_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "tip_pools_organization_id_finalized_by_fkey";
            columns: ["organization_id", "finalized_by"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "profile_id"];
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
      [_ in never]: never;
    };
    Functions: {
      board_add_column: {
        Args: {
          p_location_id: string;
          p_organization_id: string;
          p_position: number;
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
      board_undo: {
        Args: { p_organization_id: string; p_service_session_id: number };
        Returns: undefined;
      };
      recalculate_tip_pool: {
        Args: { target_tip_pool_id: number };
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
        | "add_row";
      request_status: "pending" | "approved" | "declined" | "cancelled";
      rotation_status: "active" | "paused" | "closing" | "unavailable";
      schedule_status: "draft" | "published" | "archived";
      seating_status: "seated" | "closed" | "cancelled" | "transferred";
      service_status: "planned" | "active" | "closed";
      shift_kind: "morning" | "evening" | "full_day";
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
      ],
      request_status: ["pending", "approved", "declined", "cancelled"],
      rotation_status: ["active", "paused", "closing", "unavailable"],
      schedule_status: ["draft", "published", "archived"],
      seating_status: ["seated", "closed", "cancelled", "transferred"],
      service_status: ["planned", "active", "closed"],
      shift_kind: ["morning", "evening", "full_day"],
      tip_pool_status: ["draft", "finalized"],
    },
  },
} as const;
