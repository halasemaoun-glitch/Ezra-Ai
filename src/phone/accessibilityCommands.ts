export type AccessibilityCommand =
  | { kind: 'click'; target: string }
  | { kind: 'type'; text: string }
  | { kind: 'scroll'; direction: 'up' | 'down' }
  | { kind: 'global'; action: 'back' | 'home' | 'notifications' | 'quick_settings' };

function normalize(value: string): string {
  return value.toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseAccessibilityCommand(command: string): AccessibilityCommand | null {
  const value = normalize(command)
    .replace(/^(?:(?:يا\s*)?(?:ازرا|ezra)[،,: -]*)/, '')
    .trim();

  if (/^(?:ارجع|رجوع|عود|back|go back)$/.test(value)) return { kind: 'global', action: 'back' };
  if (/^(?:الرئيسيه|الشاشه الرئيسيه|اذهب للرئيسيه|home|go home)$/.test(value)) return { kind: 'global', action: 'home' };
  if (/^(?:افتح الاشعارات|اعرض الاشعارات|اسحب الاشعارات|notifications)$/.test(value)) return { kind: 'global', action: 'notifications' };
  if (/^(?:الاعدادات السريعه|افتح الاعدادات السريعه|quick settings)$/.test(value)) return { kind: 'global', action: 'quick_settings' };

  if (/(?:مرر|اسحب|انزل|انزلي|scroll)\s*(?:الى\s*)?(?:الاسفل|للاسفل|لتحت|down)/.test(value) || /^(?:انزل|انزلي|مرر للاسفل|scroll down)$/.test(value)) {
    return { kind: 'scroll', direction: 'down' };
  }
  if (/(?:مرر|اسحب|اصعد|اطلع|scroll)\s*(?:الى\s*)?(?:الاعلى|الاعلي|للاعلى|للاعلي|لفوق|up)/.test(value) || /^(?:اصعد|اطلع|مرر للاعلى|scroll up)$/.test(value)) {
    return { kind: 'scroll', direction: 'up' };
  }

  const typeText = value.match(/^(?:اكتب|ادخل|أدخل|type)\s+(?:في\s+الحقل|داخل\s+الحقل|في\s+مربع\s+النص|في\s+خانه\s+(?:الرساله|الكتابه)|in\s+the\s+field)\s+([\s\S]{1,4000})$/);
  if (typeText) return { kind: 'type', text: typeText[1].trim() };

  const click = value.match(/^(?:اضغط|انقر|اكبس|اختار|حدد|tap|click|press)\s+(?:على\s+|علي\s+)?(?:زر\s+)?(.{1,80})$/);
  if (click) {
    const target = click[1].trim().replace(/^(?:الزر|زر)\s+/, '');
    if (!target || /^(?:على|زر)$/.test(target)) return null;
    return { kind: 'click', target };
  }
  return null;
}

export function isSensitiveAccessibilityTarget(target: string): boolean {
  const value = normalize(target);
  return /(?:حذف|احذف|مسح|الغاء الحساب|شراء|اشتر|ادفع|دفع|تحويل|ارسال|ابعث|نشر|موافق|تاكيد|اتصال|اتصل|مكالمة|اشتراك|confirm|delete|remove|buy|purchase|pay|payment|transfer|send|post|submit|call|dial|subscribe)/i.test(value);
}
