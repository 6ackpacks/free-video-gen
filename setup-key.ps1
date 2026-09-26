$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
New-Item -ItemType Directory -Path '.\data' -Force | Out-Null

function Save-EncryptedKey([string]$Label, [string]$Path, [bool]$Required = $false) {
  $key = Read-Host "$Label（输入不会显示，直接回车可跳过）" -AsSecureString
  if ($key -and $key.Length -gt 0) {
    ConvertFrom-SecureString -SecureString $key | Set-Content -LiteralPath $Path -NoNewline
    Write-Host "$Label 已使用当前 Windows 用户账户加密保存。"
  } elseif ($Required) {
    throw "$Label 未输入"
  }
}

Save-EncryptedKey 'APIMart API Key（提示词、读图、生图和 Grok 视频）' '.\data\api-key.dpapi' $true
Save-EncryptedKey 'TokenDance API Key（Wan3 路由，可选）' '.\data\tokendance-key.dpapi'
Save-EncryptedKey '阿里云百炼 API Key（Wan3 官方路由，可选）' '.\data\dashscope-key.dpapi'
