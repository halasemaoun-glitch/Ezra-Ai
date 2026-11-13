export type PhoneSettingsTarget = 'storage' | 'date' | 'privacy' | 'security' | 'language' | 'defaults' | 'app_permissions';
export const PHONE_SETTINGS_COMMANDS: { target: PhoneSettingsTarget; label: string; examples: string[] }[] = [
  { target: 'storage', label: 'مساحة التخزين', examples: ['افتح إعدادات التخزين', 'افتح مساحة التخزين', 'open storage settings'] },
  { target: 'date', label: 'التاريخ والوقت', examples: ['افتح إعدادات التاريخ والوقت', 'افتح الوقت والتاريخ', 'open date and time settings'] },
  { target: 'privacy', label: 'الخصوصية', examples: ['افتح إعدادات الخصوصية', 'open privacy settings'] },
  { target: 'security', label: 'الأمان', examples: ['افتح إعدادات الأمان', 'open security settings'] },
  { target: 'language', label: 'اللغة', examples: ['افتح إعدادات اللغة', 'تغيير لغة الهاتف', 'open language settings'] },
  { target: 'defaults', label: 'التطبيقات الافتراضية', examples: ['افتح التطبيقات الافتراضية', 'open default apps'] },
  { target: 'app_permissions', label: 'أذونات EZRA', examples: ['افتح أذونات EZRA', 'إدارة أذونات EZRA', 'open app permissions'] },
];
export function normalizePhoneCommand(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[إأآ]/g, 'ا').replace(/[\u064B-\u065F\u0670ـ]/g, '')
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/\s+/g, ' ');
}
export function parsePhoneSettingsTarget(command: string): PhoneSettingsTarget | null {
  const value = normalizePhoneCommand(command);
  const openPrefix = /^(?:(?:يا\s*)?(?:ازرا|ezra)[،,: -]*)?(?:من فضلك\s*)?(?:افتح|اعرض|اذهب الى|روح على|ادارة|إدارة|show|open)\s+/;
  const target = value.replace(openPrefix, '').replace(/^(?:اعدادات|الاعدادات|settings)\s+/, '').replace(/\s+settings$/, '').trim();
  if (/^(?:مساحة التخزين|التخزين|الذاكرة|storage|storage settings)$/.test(target)) return 'storage';
  if (/^(?:التاريخ والوقت|الوقت والتاريخ|التاريخ|date and time|date|time settings)$/.test(target)) return 'date';
  if (/^(?:الخصوصية|privacy)$/.test(target)) return 'privacy';
  if (/^(?:الامان|الامن|security)$/.test(target)) return 'security';
  if (/^(?:اللغة|لغات|language|languages)$/.test(target)) return 'language';
  if (/^(?:التطبيقات الافتراضية|التطبيق الافتراضي|default apps)$/.test(target)) return 'defaults';
  if (/^(?:اذونات ezra|اذونات التطبيق|صلاحيات التطبيق|permissions|app permissions)$/.test(target)) return 'app_permissions';
  return null;
}
