// A Lucide icon (the web app's set) in one of the theme's text colours.
import type { LucideIcon } from "lucide-react-native";
import { useResolveClassNames } from "uniwind";

const TONES = {
  "destructive-foreground": "text-destructive-foreground",
  foreground: "text-foreground",
  "info-foreground": "text-info-foreground",
  "muted-foreground": "text-muted-foreground",
  "success-foreground": "text-success-foreground",
} as const;

export type Tone = keyof typeof TONES;

export const Icon = ({
  icon: Glyph,
  size = 16,
  tone = "muted-foreground",
}: {
  readonly icon: LucideIcon;
  readonly size?: number;
  readonly tone?: Tone;
}) => {
  const { color } = useResolveClassNames(TONES[tone]);

  return <Glyph aria-hidden color={color} size={size} strokeWidth={2} />;
};
