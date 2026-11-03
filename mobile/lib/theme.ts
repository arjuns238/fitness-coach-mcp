// Colors: iOS's own grouped-list neutrals, so screens sit naturally next to system UI, plus Hulk's blue ramp
// (the same steps as the web dashboard) for meters, charts and buttons. Status colors always come with a label.
import { useColorScheme } from 'react-native';

const light = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  fill: '#E5E5EA',
  separator: '#C6C6C8',
  text: '#000000',
  text2: '#6C6C70',
  text3: '#8E8E93',
  accent: '#2a78d6',
  accentStrong: '#256abf',
  accentTrack: '#cde2fb',
  accentSoft: '#b7d3f6',
  onAccent: '#FFFFFF',
  good: '#0ca30c',
  serious: '#ec835a',
  critical: '#d03b3b',
};

const dark: typeof light = {
  background: '#000000',
  surface: '#1C1C1E',
  fill: '#2C2C2E',
  separator: '#38383A',
  text: '#FFFFFF',
  text2: '#AEAEB2',
  text3: '#8E8E93',
  accent: '#3987e5',
  accentStrong: '#5598e7',
  accentTrack: '#0d366b',
  accentSoft: '#184f95',
  onAccent: '#FFFFFF',
  good: '#30d158',
  serious: '#ec835a',
  critical: '#ff6961',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
