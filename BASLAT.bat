@echo off
title Iyilik Kumbarasi - Baslatiliyor...
color 0B
echo.
echo  ============================================
echo   IYILIK KUMBARASI v2.0 - Proje Baslatici
echo  ============================================
echo.

:: Node.js kontrolu
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo  [HATA] Node.js yuklu degil!
    echo  https://nodejs.org adresinden indirin.
    pause
    exit
)

:: node_modules kontrolu
if not exist "node_modules\" (
    echo  [KURULUM] Kutuphaneler indiriliyor...
    call npm install
    echo.
)

echo  Sunucu baslatiliyor...
echo.
echo  Adresler:
echo    Yukleme Sayfasi : http://localhost:3000/upload
echo    Ekran Gorunumu  : http://localhost:3000/display
echo    Admin Paneli    : http://localhost:3000/admin
echo    Mobil (LAN)     : http://192.168.2.75:3000/upload
echo.

timeout /t 1 /nobreak >nul
start http://localhost:3000/display

npm start
pause
