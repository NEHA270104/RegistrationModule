export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      payment_webhook_log: {
        Row: {
          id: string;
          webhook_id: string;
          event_type: string;
          razorpay_payment_id: string | null;
          razorpay_order_id: string | null;
          payload: any;
          processed: boolean | null;
          processed_at: string | null;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          webhook_id: string;
          event_type: string;
          razorpay_payment_id?: string | null;
          razorpay_order_id?: string | null;
          payload: any;
          processed?: boolean | null;
          processed_at?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          webhook_id?: string;
          event_type?: string;
          razorpay_payment_id?: string | null;
          razorpay_order_id?: string | null;
          payload?: any;
          processed?: boolean | null;
          processed_at?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
      };
      subscriptions: {
        Row: {
          id: string;
          tenant_id: string;
          plan_name: string;
          billing_cycle: string;
          amount: number;
          currency: string | null;
          status: string | null;
          razorpay_subscription_id: string | null;
          razorpay_plan_id: string | null;
          current_period_start: string | null;
          current_period_end: string | null;
          trial_ends_at: string | null;
          cancelled_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          plan_name: string;
          billing_cycle: string;
          amount: number;
          currency?: string | null;
          status?: string | null;
          razorpay_subscription_id?: string | null;
          razorpay_plan_id?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          trial_ends_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          plan_name?: string;
          billing_cycle?: string;
          amount?: number;
          currency?: string | null;
          status?: string | null;
          razorpay_subscription_id?: string | null;
          razorpay_plan_id?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          trial_ends_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      v_registration_stats: {
        Row: {
          tier: string | null;
          payment_status: string | null;
          count: number | null;
          total_revenue: number | null;
        };
        Insert: {
          tier?: string | null;
          payment_status?: string | null;
          count?: number | null;
          total_revenue?: number | null;
        };
        Update: {
          tier?: string | null;
          payment_status?: string | null;
          count?: number | null;
          total_revenue?: number | null;
        };
      };
      admin_activity_log: {
        Row: {
          id: string;
          action: string;
          admin_identifier: string | null;
          entity_type: string | null;
          entity_id: string | null;
          old_value: any | null;
          new_value: any | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          action: string;
          admin_identifier?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          old_value?: any | null;
          new_value?: any | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          action?: string;
          admin_identifier?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          old_value?: any | null;
          new_value?: any | null;
          ip_address?: string | null;
          created_at?: string;
        };
      };
      payment_abandonments: {
        Row: {
          id: string;
          registration_id: string | null;
          razorpay_order_id: string | null;
          name: string;
          email: string;
          phone: string;
          business_name: string | null;
          tier: string;
          amount: number;
          abandonment_type: string;
          abandonment_reason: string | null;
          followup_status: string;
          followup_attempts: number | null;
          last_followup_at: string | null;
          assigned_to: string | null;
          admin_notes: string | null;
          recovery_token: string | null;
          recovery_link_expires_at: string | null;
          recovery_link_used: boolean | null;
          converted_at: string | null;
          converted_registration_id: string | null;
          abandoned_at: string;
          created_at: string;
          updated_at: string;
          ip_address: string | null;
          user_agent: string | null;
          utm_source: string | null;
          utm_campaign: string | null;
          tenant_id: string | null;
        };
        Insert: {
          id?: string;
          registration_id?: string | null;
          razorpay_order_id?: string | null;
          name: string;
          email: string;
          phone: string;
          business_name?: string | null;
          tier: string;
          amount: number;
          abandonment_type: string;
          abandonment_reason?: string | null;
          followup_status?: string;
          followup_attempts?: number | null;
          last_followup_at?: string | null;
          assigned_to?: string | null;
          admin_notes?: string | null;
          recovery_token?: string | null;
          recovery_link_expires_at?: string | null;
          recovery_link_used?: boolean | null;
          converted_at?: string | null;
          converted_registration_id?: string | null;
          abandoned_at?: string;
          created_at?: string;
          updated_at?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          utm_source?: string | null;
          utm_campaign?: string | null;
          tenant_id?: string | null;
        };
        Update: {
          id?: string;
          registration_id?: string | null;
          razorpay_order_id?: string | null;
          name?: string;
          email?: string;
          phone?: string;
          business_name?: string | null;
          tier?: string;
          amount?: number;
          abandonment_type?: string;
          abandonment_reason?: string | null;
          followup_status?: string;
          followup_attempts?: number | null;
          last_followup_at?: string | null;
          assigned_to?: string | null;
          admin_notes?: string | null;
          recovery_token?: string | null;
          recovery_link_expires_at?: string | null;
          recovery_link_used?: boolean | null;
          converted_at?: string | null;
          converted_registration_id?: string | null;
          abandoned_at?: string;
          created_at?: string;
          updated_at?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          utm_source?: string | null;
          utm_campaign?: string | null;
          tenant_id?: string | null;
        };
      };
      seat_inventory: {
        Row: {
          id: string;
          tier_name: string;
          display_name: string;
          total_seats: number;
          sold_seats: number;
          held_seats: number;
          price_inr: number;
          is_active: boolean;
          description: string | null;
          benefits: any | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
          tenant_id: string | null;
        };
        Insert: {
          id?: string;
          tier_name: string;
          display_name: string;
          total_seats: number;
          sold_seats?: number;
          held_seats?: number;
          price_inr: number;
          is_active?: boolean;
          description?: string | null;
          benefits?: any | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          tenant_id?: string | null;
        };
        Update: {
          id?: string;
          tier_name?: string;
          display_name?: string;
          total_seats?: number;
          sold_seats?: number;
          held_seats?: number;
          price_inr?: number;
          is_active?: boolean;
          description?: string | null;
          benefits?: any | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          tenant_id?: string | null;
        };
      };
      v_daily_registrations: {
        Row: {
          registration_date: string | null;
          tier: string | null;
          registrations: number | null;
          revenue: number | null;
        };
        Insert: {
          registration_date?: string | null;
          tier?: string | null;
          registrations?: number | null;
          revenue?: number | null;
        };
        Update: {
          registration_date?: string | null;
          tier?: string | null;
          registrations?: number | null;
          revenue?: number | null;
        };
      };
      guests: {
        Row: {
          id: string;
          name: string;
          title: string;
          bio: string;
          photo_url: string | null;
          photo_storage_path: string | null;
          session_heading: string | null;
          session_points: any;
          sort_order: number;
          is_active: boolean;
          created_at: string | null;
          updated_at: string | null;
          tenant_id: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          title: string;
          bio: string;
          photo_url?: string | null;
          photo_storage_path?: string | null;
          session_heading?: string | null;
          session_points: any;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
          tenant_id?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          title?: string;
          bio?: string;
          photo_url?: string | null;
          photo_storage_path?: string | null;
          session_heading?: string | null;
          session_points?: any;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
          tenant_id?: string | null;
        };
      };
      pending_orders: {
        Row: {
          id: string;
          razorpay_order_id: string;
          tier: string;
          amount: number;
          email: string;
          phone: string;
          name: string;
          status: string;
          expires_at: string;
          created_at: string;
          completed_at: string | null;
          metadata: any | null;
        };
        Insert: {
          id?: string;
          razorpay_order_id: string;
          tier: string;
          amount: number;
          email: string;
          phone: string;
          name: string;
          status?: string;
          expires_at: string;
          created_at?: string;
          completed_at?: string | null;
          metadata?: any | null;
        };
        Update: {
          id?: string;
          razorpay_order_id?: string;
          tier?: string;
          amount?: number;
          email?: string;
          phone?: string;
          name?: string;
          status?: string;
          expires_at?: string;
          created_at?: string;
          completed_at?: string | null;
          metadata?: any | null;
        };
      };
      msme_benefits: {
        Row: {
          id: string;
          title: string;
          description: string;
          icon: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string | null;
          updated_at: string | null;
          tenant_id: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string;
          icon?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
          tenant_id?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string;
          icon?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
          tenant_id?: string | null;
        };
      };
      waitlist: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string;
          business_name: string | null;
          industry: string | null;
          preferred_tier: string;
          position: number;
          is_notified: boolean | null;
          notified_at: string | null;
          converted_to_registration_id: string | null;
          converted_at: string | null;
          has_livestream_access: boolean | null;
          livestream_payment_id: string | null;
          livestream_amount: number | null;
          created_at: string;
          updated_at: string;
          ip_address: string | null;
          utm_source: string | null;
          tenant_id: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          phone: string;
          business_name?: string | null;
          industry?: string | null;
          preferred_tier?: string;
          position: number;
          is_notified?: boolean | null;
          notified_at?: string | null;
          converted_to_registration_id?: string | null;
          converted_at?: string | null;
          has_livestream_access?: boolean | null;
          livestream_payment_id?: string | null;
          livestream_amount?: number | null;
          created_at?: string;
          updated_at?: string;
          ip_address?: string | null;
          utm_source?: string | null;
          tenant_id?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          phone?: string;
          business_name?: string | null;
          industry?: string | null;
          preferred_tier?: string;
          position?: number;
          is_notified?: boolean | null;
          notified_at?: string | null;
          converted_to_registration_id?: string | null;
          converted_at?: string | null;
          has_livestream_access?: boolean | null;
          livestream_payment_id?: string | null;
          livestream_amount?: number | null;
          created_at?: string;
          updated_at?: string;
          ip_address?: string | null;
          utm_source?: string | null;
          tenant_id?: string | null;
        };
      };
      email_templates: {
        Row: {
          id: string;
          tenant_id: string | null;
          template_type: string;
          subject: string;
          html_body: string;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          template_type: string;
          subject: string;
          html_body: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          template_type?: string;
          subject?: string;
          html_body?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      flyer_templates: {
        Row: {
          id: string;
          created_at: string;
          title: string | null;
          category: string | null;
          image_url: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          title?: string | null;
          category?: string | null;
          image_url?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          title?: string | null;
          category?: string | null;
          image_url?: string | null;
        };
      };
      site_settings: {
        Row: {
          id: string;
          setting_key: string;
          setting_value: any;
          setting_type: string;
          category: string;
          description: string | null;
          is_public: boolean | null;
          created_at: string;
          updated_at: string;
          tenant_id: string | null;
        };
        Insert: {
          id?: string;
          setting_key: string;
          setting_value: any;
          setting_type?: string;
          category?: string;
          description?: string | null;
          is_public?: boolean | null;
          created_at?: string;
          updated_at?: string;
          tenant_id?: string | null;
        };
        Update: {
          id?: string;
          setting_key?: string;
          setting_value?: any;
          setting_type?: string;
          category?: string;
          description?: string | null;
          is_public?: boolean | null;
          created_at?: string;
          updated_at?: string;
          tenant_id?: string | null;
        };
      };
      tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          email: string;
          phone: string | null;
          company_name: string | null;
          logo_url: string | null;
          primary_color: string | null;
          secondary_color: string | null;
          favicon_url: string | null;
          subscription_plan: string | null;
          subscription_status: string | null;
          trial_ends_at: string | null;
          is_rebranded: boolean | null;
          rebrand_approved_at: string | null;
          rebrand_fee_paid: boolean | null;
          referral_code: string | null;
          referred_by_tenant_id: string | null;
          api_key_hash: string | null;
          custom_domain: string | null;
          domain_verified: boolean | null;
          is_active: boolean | null;
          created_at: string | null;
          updated_at: string | null;
          industry: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          email: string;
          phone?: string | null;
          company_name?: string | null;
          logo_url?: string | null;
          primary_color?: string | null;
          secondary_color?: string | null;
          favicon_url?: string | null;
          subscription_plan?: string | null;
          subscription_status?: string | null;
          trial_ends_at?: string | null;
          is_rebranded?: boolean | null;
          rebrand_approved_at?: string | null;
          rebrand_fee_paid?: boolean | null;
          referral_code?: string | null;
          referred_by_tenant_id?: string | null;
          api_key_hash?: string | null;
          custom_domain?: string | null;
          domain_verified?: boolean | null;
          is_active?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
          industry?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          email?: string;
          phone?: string | null;
          company_name?: string | null;
          logo_url?: string | null;
          primary_color?: string | null;
          secondary_color?: string | null;
          favicon_url?: string | null;
          subscription_plan?: string | null;
          subscription_status?: string | null;
          trial_ends_at?: string | null;
          is_rebranded?: boolean | null;
          rebrand_approved_at?: string | null;
          rebrand_fee_paid?: boolean | null;
          referral_code?: string | null;
          referred_by_tenant_id?: string | null;
          api_key_hash?: string | null;
          custom_domain?: string | null;
          domain_verified?: boolean | null;
          is_active?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
          industry?: string | null;
        };
      };
      v_seat_status: {
        Row: {
          tier_name: string | null;
          display_name: string | null;
          total_seats: number | null;
          sold_seats: number | null;
          held_seats: number | null;
          available_seats: number | null;
          sold_percentage: number | null;
          price_inr: number | null;
          is_active: boolean | null;
        };
        Insert: {
          tier_name?: string | null;
          display_name?: string | null;
          total_seats?: number | null;
          sold_seats?: number | null;
          held_seats?: number | null;
          available_seats?: number | null;
          sold_percentage?: number | null;
          price_inr?: number | null;
          is_active?: boolean | null;
        };
        Update: {
          tier_name?: string | null;
          display_name?: string | null;
          total_seats?: number | null;
          sold_seats?: number | null;
          held_seats?: number | null;
          available_seats?: number | null;
          sold_percentage?: number | null;
          price_inr?: number | null;
          is_active?: boolean | null;
        };
      };
      settings_change_log: {
        Row: {
          id: string;
          setting_key: string;
          old_value: any | null;
          new_value: any | null;
          changed_by: string | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          setting_key: string;
          old_value?: any | null;
          new_value?: any | null;
          changed_by?: string | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          setting_key?: string;
          old_value?: any | null;
          new_value?: any | null;
          changed_by?: string | null;
          ip_address?: string | null;
          created_at?: string;
        };
      };
      registrations: {
        Row: {
          id: string;
          booking_id: string;
          name: string;
          email: string;
          phone: string;
          business_name: string | null;
          industry: string | null;
          revenue_range: string | null;
          employee_count: string | null;
          tier: string;
          amount_paid: number;
          payment_status: string;
          registration_status: string;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          razorpay_signature: string | null;
          payment_initiated_at: string | null;
          payment_confirmed_at: string | null;
          created_at: string;
          updated_at: string;
          ip_address: string | null;
          user_agent: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          referrer: string | null;
          confirmation_email_sent: boolean | null;
          confirmation_whatsapp_sent: boolean | null;
          ticket_downloaded: boolean | null;
          tenant_id: string | null;
        };
        Insert: {
          id?: string;
          booking_id: string;
          name: string;
          email: string;
          phone: string;
          business_name?: string | null;
          industry?: string | null;
          revenue_range?: string | null;
          employee_count?: string | null;
          tier: string;
          amount_paid: number;
          payment_status?: string;
          registration_status?: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          payment_initiated_at?: string | null;
          payment_confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          referrer?: string | null;
          confirmation_email_sent?: boolean | null;
          confirmation_whatsapp_sent?: boolean | null;
          ticket_downloaded?: boolean | null;
          tenant_id?: string | null;
        };
        Update: {
          id?: string;
          booking_id?: string;
          name?: string;
          email?: string;
          phone?: string;
          business_name?: string | null;
          industry?: string | null;
          revenue_range?: string | null;
          employee_count?: string | null;
          tier?: string;
          amount_paid?: number;
          payment_status?: string;
          registration_status?: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          payment_initiated_at?: string | null;
          payment_confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          referrer?: string | null;
          confirmation_email_sent?: boolean | null;
          confirmation_whatsapp_sent?: boolean | null;
          ticket_downloaded?: boolean | null;
          tenant_id?: string | null;
        };
      };
      legal_acceptances: {
        Row: {
          id: string;
          tenant_id: string | null;
          document_type: string | null;
          document_version: string | null;
          accepted_by_email: string | null;
          accepted_at: string | null;
          ip_address: string | null;
          user_agent: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          document_type?: string | null;
          document_version?: string | null;
          accepted_by_email?: string | null;
          accepted_at?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          document_type?: string | null;
          document_version?: string | null;
          accepted_by_email?: string | null;
          accepted_at?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      tier_type: 'vip' | 'standard' | 'basic' | 'waitlist' | 'starter' | 'pro' | 'enterprise';
    };
  };
}
