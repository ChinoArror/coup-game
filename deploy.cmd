@echo off
setlocal
cd /d "%~dp0"
set LOG=%~dp0deploy.log
echo Coup: Shadow Protocol - install / test / build / deploy > "%LOG%"
echo Started %DATE% %TIME% >> "%LOG%"

echo [1/4] npm install ...
echo. >> "%LOG%" & echo ===== npm install ===== >> "%LOG%"
call npm install >> "%LOG%" 2>&1 || goto :fail

echo [2/4] npm test ...
echo. >> "%LOG%" & echo ===== npm test ===== >> "%LOG%"
call npm test >> "%LOG%" 2>&1 || goto :fail

echo [3/4] npm run build ...
echo. >> "%LOG%" & echo ===== npm run build ===== >> "%LOG%"
call npm run build >> "%LOG%" 2>&1 || goto :fail

echo [4/4] wrangler deploy ...
echo. >> "%LOG%" & echo ===== wrangler deploy ===== >> "%LOG%"
call npx --yes wrangler deploy >> "%LOG%" 2>&1 || goto :fail

echo. >> "%LOG%" & echo DEPLOY_OK %DATE% %TIME% >> "%LOG%"
echo.
echo Deployed successfully. Details in deploy.log
pause
exit /b 0

:fail
echo. >> "%LOG%" & echo DEPLOY_FAILED %DATE% %TIME% >> "%LOG%"
echo.
echo A step failed. Details in deploy.log - tell Claude and it will read the log.
pause
exit /b 1
