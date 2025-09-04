// Generic JSON type used by Supabase
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Small helpers 
type Nullable<T> = T | null;
type Timestamp = string;

//  table shapes
type CompanyRow = {
  id: string;
  name: Nullable<string>;
  domain: Nullable<string>;
  country: Nullable<string>;
  city: Nullable<string>;
  employee_size_bucket: Nullable<string>;
  created_at: Timestamp;
  updated_at: Timestamp;
  raw_json: Json;
};

type CompanyInsert = {
  id?: string;
  name?: Nullable<string>;
  domain?: Nullable<string>;
  country?: Nullable<string>;
  city?: Nullable<string>;
  employee_size_bucket?: Nullable<string>;
  created_at?: Timestamp;
  updated_at?: Timestamp;
  raw_json: Json; 
};

type CompanyUpdate = {
  id?: string;
  name?: Nullable<string>;
  domain?: Nullable<string>;
  country?: Nullable<string>;
  city?: Nullable<string>;
  employee_size_bucket?: Nullable<string>;
  created_at?: Timestamp;
  updated_at?: Timestamp;
  raw_json?: Json;
};

// Supabase Database schema (public)
export type Database = {
  public: {
    Tables: {
      companies: {
        Row: CompanyRow;
        Insert: CompanyInsert;
        Update: CompanyUpdate;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
