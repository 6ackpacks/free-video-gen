@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 需要先安装 Node.js 24 或更新版本。
  pause
  exit /b 1
)
if not exist "node_modules\electron\package.json" (
  echo 首次启动，正在安装桌面运行环境...
  call npm install
  if errorlevel 1 (
    echo 安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)
if not exist "data\api-key.dpapi" (
  echo 尚未配置 APIMart/Qwen 密钥。工作台可以打开，但场景分析与视频生成暂不可用。
  echo 需要配置时运行：pwsh -File setup-key.ps1
)
echo 工作台会自动检查并启动内置 DoubaoManager，首次运行可能需要下载组件和浏览器。
call npm run desktop
pause
