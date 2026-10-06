@echo off
chcp 65001 >nul
echo ========================================================
echo     Restaurando Banco de Dados PostgreSQL AllDelivery
echo ========================================================
echo.

set PGPASSWORD=postgres
set PSQL_BIN=C:\Program Files\PostgreSQL\17\bin\psql.exe

if not exist "%PSQL_BIN%" (
    set PSQL_BIN=psql
)

set BACKUP_FILE=%~dp0..\prisma\alldelivery_backup.sql

if not exist "%BACKUP_FILE%" (
    echo [ERRO] Arquivo prisma\alldelivery_backup.sql nao encontrado!
    exit /b 1
)

echo Restaurando dados para o banco alldelivery...
"%PSQL_BIN%" -h localhost -p 5433 -U postgres -d alldelivery -f "%BACKUP_FILE%"

if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCESSO] Banco de dados restaurado com sucesso!
) else (
    echo.
    echo [AVISO/ERRO] Processo finalizado com codigos de retorno. Verifique as mensagens acima.
)
