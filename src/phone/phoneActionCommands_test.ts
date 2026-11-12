import { parsePhoneActionCommand } from './phoneActionCommands.ts';

Deno.test('parses Arabic and English file manager and downloads commands', () => {
  const cases: [string, string][] = [
    ['افتح مدير الملفات', 'open_files'],
    ['اعرض الملفات', 'open_files'],
    ['open files', 'open_files'],
    ['افتح التنزيلات', 'open_downloads'],
    ['show downloads', 'open_downloads'],
  ];
  for (const [input, expected] of cases) {
    if (parsePhoneActionCommand(input)?.kind !== expected) throw new Error(`Failed: ${input}`);
  }
});

Deno.test('parses notification shade separately from notification settings', () => {
  if (parsePhoneActionCommand('اعرض الاشعارات')?.kind !== 'show_notifications') throw new Error('Notification shade command failed');
  if (parsePhoneActionCommand('افتح إعدادات الإشعارات')?.kind !== 'notification_settings') throw new Error('Notification settings command failed');
});

Deno.test('parses media transport commands without matching unrelated phrases', () => {
  const cases: [string, string][] = [
    ['شغل الموسيقى', 'play'], ['وقف الموسيقى', 'pause'], ['التالي', 'next'],
    ['السابق', 'previous'], ['stop music', 'stop'], ['resume', 'play'],
  ];
  for (const [input, expected] of cases) {
    const result = parsePhoneActionCommand(input);
    if (result?.kind !== 'media' || result.action !== expected) throw new Error(`Failed: ${input}`);
  }
  if (parsePhoneActionCommand('اشرح لي الموسيقى') !== null) throw new Error('Informational text was treated as a media command');
  if (parsePhoneActionCommand('افتح تطبيق واتساب') !== null) throw new Error('App launch was treated as a file action');
});
