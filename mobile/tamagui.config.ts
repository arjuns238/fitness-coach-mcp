// Tamagui: the component library for the app's buttons, inputs, cards, toggles and progress bars. The standard
// v5 themes (light and dark follow the phone), animated with Reanimated, which Expo Go already includes.
import { defaultConfig } from '@tamagui/config/v5';
import { animations } from '@tamagui/config/v5-reanimated';
import { createTamagui } from 'tamagui';

export const config = createTamagui({
  ...defaultConfig,
  animations,
  settings: {
    ...defaultConfig.settings,
    // Allow the long style names (alignItems, paddingVertical) and plain color values, so screens can use the
    // iOS palette in theme.ts directly alongside Tamagui's tokens.
    onlyAllowShorthands: false,
    allowedStyleValues: false,
  },
});

type AppConfig = typeof config;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config;
