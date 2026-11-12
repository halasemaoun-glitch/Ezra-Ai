import { normalizePhoneCommand, parsePhoneSettingsTarget, PHONE_SETTINGS_COMMANDS } from './phoneControlCommands.ts';
Deno.test('normalizes Arabic variants, diacritics and Arabic digits', () => {
  if (normalizePhoneCommand('إفْتَحْ ١٢') !== 'افتح 12') throw new Error('Arabic command normalization failed');
});
Deno.test('parses expanded Arabic and English phone settings commands', () => {
  const cases: [string, string][] = [
    ['افتح إعدادات التخزين', 'storage'], ['افتح مساحة التخزين', 'storage'],
    ['افتح إعدادات التاريخ والوقت', 'date'], ['open privacy settings', 'privacy'],
    ['افتح إعدادات الأمان', 'security'], ['افتح إعدادات اللغة', 'language'],
    ['افتح التطبيقات الافتراضية', 'defaults'], ['إدارة أذونات التطبيقات', 'app_permissions'],
  ];
  for (const [command, expected] of cases) if (parsePhoneSettingsTarget(command) !== expected) throw new Error(`Failed to parse: ${command}`);
});
Deno.test('does not mistake unrelated requests for phone settings', () => {
  if (parsePhoneSettingsTarget('مرحبا يا إزرا') !== null) throw new Error('Unrelated phrase matched a settings action');
  if (parsePhoneSettingsTarget('اشرح لي الخصوصية') !== null) throw new Error('Informational question matched a settings action');
});
Deno.test('dashboard command examples cover every new settings shortcut', () => {
  if (PHONE_SETTINGS_COMMANDS.length !== 7 || PHONE_SETTINGS_COMMANDS.some(item => item.examples.length < 2)) throw new Error('Phone settings examples are incomplete');
});
