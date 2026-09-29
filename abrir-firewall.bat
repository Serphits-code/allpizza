@echo off
echo ============================================
echo  AllDelivery - Corrigindo Portas no Firewall
echo  (Perfil Publico + Privado + Dominio)
echo ============================================
echo.

REM Remove regras antigas que podem estar so com perfil privado
netsh advfirewall firewall delete rule name="AllDelivery NextJS (3000)" >nul 2>&1
netsh advfirewall firewall delete rule name="AllDelivery Electron Print (3001)" >nul 2>&1

REM Cria regras novas para TODOS os perfis (any = publico+privado+dominio)
netsh advfirewall firewall add rule name="AllDelivery NextJS (3000)" dir=in action=allow protocol=TCP localport=3000 profile=any
netsh advfirewall firewall add rule name="AllDelivery Electron Print (3001)" dir=in action=allow protocol=TCP localport=3001 profile=any

echo.
echo ============================================
echo  Portas 3000 e 3001 liberadas em TODOS
echo  os perfis (Publico, Privado e Dominio)!
echo ============================================
echo.
pause
