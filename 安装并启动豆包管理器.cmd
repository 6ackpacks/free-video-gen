@echo off
cd /d "%~dp0"
echo DoubaoManager 已经合并为工作台的内置后台服务，不需要单独启动。
echo 现在将启动“帧间”工作台；首次运行会自动下载并准备豆包组件。
call "启动工作台.cmd"
