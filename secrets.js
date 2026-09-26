import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export function readSecret(prefix) {
  const direct = process.env[`${prefix}_API_KEY`] || '';
  if (direct) return direct.trim();
  const filename = process.env[`${prefix}_API_KEY_FILE`] || '';
  if (filename && fs.existsSync(filename)) return fs.readFileSync(filename, 'utf8').trim();
  const dpapi = process.env[`${prefix}_API_KEY_DPAPI_FILE`] || '';
  if (dpapi && fs.existsSync(dpapi) && process.platform === 'win32') {
    const script = '$s=(Get-Content -LiteralPath $env:CODEX_SECRET_FILE -Raw).Trim() | ConvertTo-SecureString; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }';
    const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', env: { ...process.env, CODEX_SECRET_FILE: dpapi } });
    if (result.status !== 0) throw new Error(`无法读取 ${prefix} 的 Windows 加密密钥`);
    return result.stdout.trim();
  }
  const service = process.env[`${prefix}_API_KEY_KEYCHAIN_SERVICE`] || '';
  if (service && process.platform === 'darwin') {
    const result = spawnSync('security', ['find-generic-password', '-a', process.env.USER || '', '-s', service, '-w'], { encoding: 'utf8' });
    if (result.status === 0) return result.stdout.trim();
  }
  return '';
}

export function hasSecret(prefix) {
  const direct = Boolean(process.env[`${prefix}_API_KEY`]);
  const file = process.env[`${prefix}_API_KEY_FILE`] || '';
  const dpapi = process.env[`${prefix}_API_KEY_DPAPI_FILE`] || '';
  if (direct || (file && fs.existsSync(file)) || (dpapi && fs.existsSync(dpapi))) return true;
  const service = process.env[`${prefix}_API_KEY_KEYCHAIN_SERVICE`] || '';
  if (service && process.platform === 'darwin') return spawnSync('security', ['find-generic-password', '-a', process.env.USER || '', '-s', service], { stdio: 'ignore' }).status === 0;
  return false;
}
