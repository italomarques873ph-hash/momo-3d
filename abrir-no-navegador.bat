@echo off
chcp 65001 >nul
title MOMO 3D - Abrir no Navegador
echo ========================================
echo   MOMO 3D - FNAF Style (HTML5 + Three.js)
echo ========================================
echo.
echo  PROJETO 100% LOCAL - sem servidores externos.
echo  O jogo precisa de um servidor local para carregar o
echo  modelo 3D (GLB) e as texturas sem erro de CORS.
echo.
echo OPCAO A - Python (mais confiavel):
echo   Abra o terminal nesta pasta e rode:
echo       python -m http.server 8080
echo   Depois acesse: http://localhost:8080
echo.
echo OPCAO B - Abrir direto (pode funcionar na maioria):
echo.
echo Abrindo index.html no navegador padrao...
start "" "index.html"
echo.
echo Se o modelo 3D nao carregar, use a OPCAO A (servidor local).
pause
