import {
  AppWindow,
  Bath,
  BrickWall,
  Droplets,
  Fence,
  Flame,
  Flower2,
  Footprints,
  Grid3x3,
  LayoutPanelTop,
  LibraryBig,
  Paintbrush,
  ShowerHead,
  Sparkles,
  Square,
  Tent,
  Toilet,
  TreeDeciduous,
  Waves,
  type LucideIcon,
} from "lucide-react";

export const ITEM_ICONS: Record<string, LucideIcon> = {
  AppWindow,
  Bath,
  BrickWall,
  Droplets,
  Fence,
  Flame,
  Flower2,
  Footprints,
  Grid3x3,
  LayoutPanelTop,
  LibraryBig,
  Paintbrush,
  ShowerHead,
  Sparkles,
  Square,
  Tent,
  Toilet,
  TreeDeciduous,
  Waves,
};

export function ItemIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ITEM_ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}
