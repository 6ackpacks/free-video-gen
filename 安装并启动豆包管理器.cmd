@echo off
setlocal
cd /d "%~dp0"
if not exist "integrations\DoubaoManager\run.bat" (
  where git >nul 2>&1
  if errorlevel 1 (
    echo 请先安装 Git，然后重新双击本脚本。
    pause
    exit /b 1
  )
  if not exist "integrations" mkdir "integrations"
  echo 正在从原项目下载 DoubaoManager...
  git clone --depth 1 https://github.com/shukeCyp/DoubaoManager.git "integrations\DoubaoManager"
  if errorlevel 1 (
    echo 下载失败，请检查网络后重试。
    pause
    exit /b 1
  )
)
cd /d "integrations\DoubaoManager"
call run.bat
endlocal
