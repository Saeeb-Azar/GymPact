import type { MealType } from '@/lib/database.types';
import { IconApple, IconMoon, IconSun, IconSunrise } from '../icons';

const ICONS = { breakfast: IconSunrise, lunch: IconSun, dinner: IconMoon, snack: IconApple };

export function MealIcon({ meal, size = 20, className = '' }: { meal: MealType; size?: number; className?: string }) {
  const Icon = ICONS[meal];
  return <Icon size={size} className={className} />;
}
