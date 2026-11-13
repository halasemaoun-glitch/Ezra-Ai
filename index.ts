import { registerRootComponent } from 'expo';
import { install } from 'react-native-quick-crypto';

// Install WebCrypto before loading App.tsx and any modules (such as Supabase)
// that may access crypto.subtle during module initialization.
install();

// Deliberately require App only after install(): static imports are evaluated
// before this file's body, so a static App import would run too early.
const App = require('./App').default;

registerRootComponent(App);
