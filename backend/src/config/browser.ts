import type { LaunchOptions } from 'playwright';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { env } from './env';

function channel() {
  if (env.BROWSER_CHANNEL) return env.BROWSER_CHANNEL === 'bundled' ? undefined : env.BROWSER_CHANNEL;
  if (process.platform !== 'win32') return undefined;
  const chrome = ['PROGRAMFILES','PROGRAMFILES(X86)','LOCALAPPDATA'].some(key =>
    process.env[key] && existsSync(join(process.env[key]!, 'Google/Chrome/Application/chrome.exe')));
  return chrome ? 'chrome' : 'msedge';
}
export function browserOptions(): LaunchOptions {
  return {
    channel:channel(),headless:env.BROWSER_HEADLESS,timeout:env.BROWSER_TIMEOUT,
    args:process.platform==='win32' ? ['--disable-crash-reporter','--disable-crashpad','--disable-gpu'] : [],
  };
}
