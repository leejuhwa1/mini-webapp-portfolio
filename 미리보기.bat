@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  ASMR DOORS 미리보기 서버를 켰어요.
echo  브라우저가 자동으로 열려요. 끝내려면 이 창을 닫으세요.
echo.
start "" http://localhost:5173/
node .claude\serve.mjs
pause
