@echo off
rem Million Pixel Wall on this computer: database, website and browser.
rem Close this window to stop everything.
title Million Pixel Wall
chcp 65001 >nul
cd /d "%~dp0..\.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --import tsx scripts\desktop.ts
if errorlevel 1 pause
