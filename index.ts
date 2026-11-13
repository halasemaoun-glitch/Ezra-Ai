import { install as installQuickCrypto } from 'react-native-quick-crypto';

// Hermes does not provide WebCrypto by default. Install crypto.subtle
// before importing the app or Supabase clients that may access it.
installQuickCrypto();

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);