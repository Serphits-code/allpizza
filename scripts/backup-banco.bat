@echo off
chcp 65001 >nul
echo ========================================================
echo       Backup do Banco de Dados PostgreSQL AllDelivery
echo ========================================================
echo.

set PGPASSWORD=postgres
set PG_BIN=C:\Program Files\PostgreSQL\17\bin\pg_dump.exe

if not exist "%PG_BIN%" (
    set PG_BIN=pg_dump
)

"%PG_BIN%" -h localhost -p 5433 -U postgres -d alldelivery -F p -b -v -f "%~dp0..\prisma\alldelivery_backup.sql"

if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCESSO] Backup gerado com sucesso em prisma/alldelivery_backup.sql!
) else (
    echo.
    echo [ERRO] Falha ao gerar o backup do banco de dados.
)
