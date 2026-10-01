// Handgepflegte Typen für das Supabase-Schema (siehe supabase/migrations).
// Bei Schemaänderungen hier synchron halten – oder mit
// `supabase gen types typescript` neu generieren und angleichen.
// Die alten Challenge-Tabellen existieren weiter in der DB, werden von
// der App aber nicht mehr genutzt und sind hier bewusst weggelassen.

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MuscleGroup =
  | 'chest'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'back'
  | 'traps'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves';

export type ProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  timezone: string;
  height_cm: number | null;
  birth_year: number | null;
  sex: 'male' | 'female' | null;
  created_at: string;
  updated_at: string;
};

export type AppAdminRow = {
  user_id: string;
  granted_at: string;
};

export type NutritionGoalsRow = {
  user_id: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_ml: number;
  updated_at: string;
};

export type FoodRow = {
  id: string;
  created_by: string;
  name: string;
  brand: string;
  kcal_100: number;
  protein_100: number;
  carbs_100: number;
  fat_100: number;
  default_amount_g: number;
  barcode: string | null;
  created_at: string;
};

export type FoodEntryRow = {
  id: string;
  user_id: string;
  date: string;
  meal: MealType;
  food_id: string | null;
  name: string;
  amount_g: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at: string;
};

export type DailyLogRow = {
  user_id: string;
  date: string;
  water_ml: number;
  body_weight_kg: number | null;
  note: string;
  updated_at: string;
};

export type TrainingWeekRow = {
  id: string;
  user_id: string;
  week_start: string;
  title: string;
  notes: string;
  created_at: string;
};

export type WorkoutRow = {
  id: string;
  week_id: string;
  user_id: string;
  name: string;
  day_of_week: number | null;
  position: number;
  notes: string;
  done_at: string | null;
  created_at: string;
};

export type WorkoutExerciseRow = {
  id: string;
  workout_id: string;
  user_id: string;
  name: string;
  muscle_group: MuscleGroup | null;
  position: number;
  notes: string;
  created_at: string;
};

export type ExerciseSetRow = {
  id: string;
  exercise_id: string;
  user_id: string;
  position: number;
  weight_kg: number;
  reps: number;
  done: boolean;
  created_at: string;
};

export type AdminUserOverviewRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  is_admin: boolean;
  food_days: number;
  food_entries: number;
  workouts_done: number;
  training_weeks: number;
  last_activity: string | null;
};

type Table<Row, Insert, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Partial<ProfileRow> & { id: string }>;
      app_admins: Table<AppAdminRow, never, never>; // nur manuell im SQL-Editor
      nutrition_goals: Table<
        NutritionGoalsRow,
        Partial<Omit<NutritionGoalsRow, 'updated_at'>> & { user_id: string }
      >;
      foods: Table<
        FoodRow,
        Omit<FoodRow, 'id' | 'created_at' | 'barcode' | 'brand' | 'default_amount_g'> & {
          brand?: string;
          default_amount_g?: number;
          barcode?: string | null;
        }
      >;
      food_entries: Table<
        FoodEntryRow,
        Omit<FoodEntryRow, 'id' | 'created_at' | 'food_id' | 'amount_g'> & {
          food_id?: string | null;
          amount_g?: number | null;
        }
      >;
      daily_logs: Table<
        DailyLogRow,
        Partial<Omit<DailyLogRow, 'updated_at'>> & { user_id: string; date: string }
      >;
      training_weeks: Table<
        TrainingWeekRow,
        { user_id: string; week_start: string; title?: string; notes?: string }
      >;
      workouts: Table<
        WorkoutRow,
        {
          week_id: string;
          user_id: string;
          name: string;
          day_of_week?: number | null;
          position?: number;
          notes?: string;
          done_at?: string | null;
        }
      >;
      workout_exercises: Table<
        WorkoutExerciseRow,
        {
          workout_id: string;
          user_id: string;
          name: string;
          muscle_group?: MuscleGroup | null;
          position?: number;
          notes?: string;
        }
      >;
      exercise_sets: Table<
        ExerciseSetRow,
        {
          exercise_id: string;
          user_id: string;
          position?: number;
          weight_kg?: number;
          reps?: number;
          done?: boolean;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      copy_training_week: {
        Args: { p_source_week: string; p_target_start: string };
        Returns: string;
      };
      admin_user_overview: {
        Args: Record<PropertyKey, never>;
        Returns: AdminUserOverviewRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
