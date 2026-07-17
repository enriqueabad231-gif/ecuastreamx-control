@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Debes instalar Node.js antes de continuar.
  pause
  exit /b 1
)
call npm install
call npx wrangler login
echo.
echo Ahora ejecuta: npx wrangler d1 create ecuastreamx-db
echo Copia el database_id dentro de wrangler.jsonc y sigue README.md.
pause
