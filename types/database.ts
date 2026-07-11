/**
 * Database type stub — replace with `supabase gen types typescript` after migrations run.
 *
 * Uses index signatures to guarantee assignability to @supabase/postgrest-js GenericSchema.
 * Named tables are excluded here; type safety for table access is enforced at the service layer.
 */

export type Database = {
  public: {
    Tables: Record<
      string,
      {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: never[];
      }
    >;
    Views: Record<
      string,
      {
        Row: Record<string, unknown>;
        Relationships: never[];
      }
    >;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
  };
};
