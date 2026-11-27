@echo off
setlocal
set "TRAZO_NODE=%~dp0runtime\node.exe"
if not exist "%TRAZO_NODE%" set "TRAZO_NODE=node.exe"
"%TRAZO_NODE%" "%~dp0scripts\trazo.mjs"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
