@echo off
chcp 65001 >nul
title AllDelivery Desktop

echo ========================================================
echo        Iniciando AllDelivery Desktop (Electron)
echo ========================================================
echo.

cd /d "%~dp0electron"

REM Encerra eventuais processos orfaos travados do Electron
taskkill /F /IM electron.exe >nul 2>&1

REM Verifica se o executavel do Electron existe
if exist "node_modules\electron\dist\electron.exe" (
    echo Abrindo aplicativo AllDelivery Desktop...
    start "" "node_modules\electron\dist\electron.exe" .
    exit
) else (
    echo Executavel direto nao encontrado. Iniciando via npm start...
    npm start
)
