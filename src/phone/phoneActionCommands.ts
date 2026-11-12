import { normalizePhoneCommand } from './phoneControlCommands.ts';

export type PhoneActionCommand =
  | { kind: 'open_files' }
  | { kind: 'open_downloads' }
  | { kind: 'show_notifications' }
  | { kind: 'notification_settings' }
  | { kind: 'media'; action: 'play' | 'pause' | 'stop' | 'next' | 'previous' };

export function parsePhoneActionCommand(command: string): PhoneActionCommand | null {
  const value = normalizePhoneCommand(command)
    .replace(/[ى]/g, 'ي')
    .replace(/[ة]/g, 'ه');
  if (/^(?:(?:يا\s*)?(?:ازرا|ezra)\s*)?(?:افتح|اعرض|تصفح|شغل|open|browse|show)\s+(?:(?:مدير|تطبيق)\s+)?(?:الملفات|ملفاتي|files|file manager)$/.test(value)) {
    return { kind: 'open_files' };
  }
  if (/^(?:(?:يا\s*)?(?:ازرا|ezra)\s*)?(?:افتح|اعرض|تصفح|open|browse|show)\s+(?:مجلد\s+)?(?:التنزيلات|التحميلات|downloads)$/.test(value)) {
    return { kind: 'open_downloads' };
  }
  if (/^(?:(?:يا\s*)?(?:ازرا|ezra)\s*)?(?:اعرض|اظهر|افتح|show|open)\s+(?:لي\s+)?(?:الاشعارات|اشعارات الهاتف|notification shade|notifications)$/.test(value)) {
    return { kind: 'show_notifications' };
  }
  if (/^(?:(?:يا\s*)?(?:ازرا|ezra)\s*)?(?:افتح|اذهب الى|open)\s+(?:اعدادات\s+)?(?:الاشعارات|اشعارات الهاتف|notification settings)$/.test(value)) {
    return { kind: 'notification_settings' };
  }
  if (/^(?:شغل|تشغيل|استأنف|استأنفي|كمل|اكمل|play|resume)(?:\s+(?:الموسيقى|الاغاني|الصوت|الوسائط|music|media))?$/.test(value)) {
    return { kind: 'media', action: 'play' };
  }
  if (/^(?:وقف|اوقف|توقف|ايقاف|pause)(?:\s+(?:الموسيقى|الاغاني|الصوت|الوسائط|music|media))?$/.test(value)) {
    return { kind: 'media', action: 'pause' };
  }
  if (/^(?:انه|انهاء|اوقف نهائيا|stop)(?:\s+(?:الموسيقى|الاغاني|الوسائط|music|media))?$/.test(value)) {
    return { kind: 'media', action: 'stop' };
  }
  if (/^(?:التالي|تخطي|الاغنية التالية|next|skip)(?:\s+(?:الموسيقى|الاغنية|music|song))?$/.test(value)) {
    return { kind: 'media', action: 'next' };
  }
  if (/^(?:السابق|الاغنية السابقة|previous)(?:\s+(?:الموسيقى|الاغنية|music|song))?$/.test(value)) {
    return { kind: 'media', action: 'previous' };
  }
  return null;
}
