import { BadgeCheck, Wand2, Flag, MapPinned, Map, UserRound, Smile, ScrollText, Quote, Shapes, Search, Eye, AudioLines } from 'lucide-react';
import type { GameType } from '@/types/schema';
import { GAMES } from '@/games/registry';

const ICONS = { BadgeCheck, Wand2, Flag, MapPinned, Map, UserRound, Smile, ScrollText, Quote, Shapes, Search, Eye, AudioLines };

export function GameIcon({ type, size = 16, colored = true }: { type: GameType; size?: number; colored?: boolean }) {
  const I = ICONS[GAMES[type].icon as keyof typeof ICONS] ?? BadgeCheck;
  return <I size={size} style={colored ? { color: GAMES[type].color } : undefined} aria-hidden />;
}
