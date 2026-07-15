import { describe, expect, it } from 'vitest';
import { getDesktopMessages, resolveDesktopLocale } from '../src/main/i18n';

describe('desktop localization', () => {
  it.each(['zh-CN', 'zh-TW', 'ZH_hans_CN'])('selects Chinese for %s', (locale) => {
    expect(resolveDesktopLocale(locale)).toBe('zh');
  });

  it.each(['en-US', 'ja-JP', '', undefined])('defaults %s to English', (locale) => {
    expect(resolveDesktopLocale(locale)).toBe('en');
  });

  it('formats dynamic copy in the selected language', () => {
    expect(getDesktopMessages('en-US').update.currentVersion('1.2.3')).toBe('Current version: 1.2.3');
    expect(getDesktopMessages('zh-CN').update.currentVersion('1.2.3')).toBe('当前版本：1.2.3');
  });
});
