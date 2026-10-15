param([ValidateSet('Desktop','Browser','Keys')][string]$Mode = 'Desktop')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskRuntime = if ($env:FREE_VIDEO_NODE_HOME) { $env:FREE_VIDEO_NODE_HOME } else { Join-Path (Split-Path -Parent $PSScriptRoot) 'free-video-gen-runtime\node-v24.21.0-win-x64' }
if (-not (Test-Path -LiteralPath (Join-Path $taskRuntime 'node.exe')) -and -not $env:FREE_VIDEO_NODE_HOME) {
  $taskInstalledRuntime = Join-Path $env:USERPROFILE 'Apps\free-video-gen-runtime\node-v24.21.0-win-x64'
  if (Test-Path -LiteralPath (Join-Path $taskInstalledRuntime 'node.exe')) { $taskRuntime = $taskInstalledRuntime }
}
if (Test-Path -LiteralPath (Join-Path $taskRuntime 'node.exe')) { $env:PATH = $taskRuntime + ';' + $env:PATH }
$env:PATH = (Join-Path $env:USERPROFILE '.local\bin') + ';' + $env:PATH
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
if ([int]((& $taskNode --version) -replace '^v([0-9]+).*$', '$1') -lt 23) { throw '请安装 Node.js 23 或更高版本，或设置 FREE_VIDEO_NODE_HOME 指向独立运行时。' }
if ($Mode -eq 'Keys') { & (Join-Path $PSScriptRoot 'setup-key.ps1'); exit }
foreach ($taskEnvFile in @('project.env','project.env.local')) {
  if (-not (Test-Path -LiteralPath $taskEnvFile)) { continue }
  foreach ($taskLine in Get-Content -LiteralPath $taskEnvFile) {
    if ($taskLine -match '^\s*([^#=\s]+)\s*=(.*)$') {
      [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), 'Process')
    }
  }
}
# 保留显式的直连配置，避免桌面端恢复仓库默认代理。
if (-not $env:APIMART_PROXY) { $env:APIMART_PROXY = ' ' }
New-Item -ItemType Directory -Path data -Force | Out-Null
if ($Mode -eq 'Browser') {
  Start-Process -FilePath $taskNode -ArgumentList 'server.js' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput 'data\browser.stdout.log' -RedirectStandardError 'data\browser.stderr.log'
} else {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  Start-Process -FilePath (Join-Path $PSScriptRoot 'node_modules\electron\dist\electron.exe') -ArgumentList '.' -WorkingDirectory $PSScriptRoot -WindowStyle Normal -RedirectStandardOutput 'data\desktop.stdout.log' -RedirectStandardError 'data\desktop.stderr.log'
}
