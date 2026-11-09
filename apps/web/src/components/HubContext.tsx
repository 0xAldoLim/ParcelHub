import { createContext, useContext } from 'react';
import {
  defaultSettings,
  type Parcel,
  type Settings,
  type Notice,
  type ProviderInfo,
} from '../../../../packages/shared/src/index';
import { words, type Language } from '../lib/i18n';
import type { Change } from '../lib/offline';
export interface Hub {
  parcels: Parcel[];
  online: boolean;
  pending: Change[];
  settings: Settings;
  providers: ProviderInfo[];
  notices: Notice[];
  t: typeof words.en;
  language: Language;
  reload: () => Promise<void>;
  toast: (text: string) => void;
  add: (parcel?: Parcel) => void;
  setAppearance: (key: 'theme' | 'language', value: string) => void;
  install: () => void;
  installable: boolean;
}
export const HubContext = createContext<Hub>({
  parcels: [],
  online: false,
  pending: [],
  settings: defaultSettings,
  providers: [],
  notices: [],
  t: words.en,
  language: 'en',
  reload: async () => {},
  toast: () => {},
  add: () => {},
  setAppearance: () => {},
  install: () => {},
  installable: false,
});
export function useHub() {
  return useContext(HubContext);
}
