import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://qjqbgbbrzovimyutzvps.supabase.co';

// Paste the Supabase publishable key (sb_publishable_...) here.
// Never put the sb_secret_ key or Gemini API key in this file.
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_9kpaRSH8gj1f7Z8SvZBm5g_6i-ng8hd';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
