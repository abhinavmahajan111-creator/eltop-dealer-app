@echo off
cd /d "%~dp0"
echo ============================================
echo   ELTOP DEALER APP - QUICK PUSH
echo ============================================
echo.
set /p msg="Commit message likho aur Enter dabao: "
if "%msg%"=="" set msg=quick update

git add -A
git commit -m "%msg%"
git push origin master

echo.
echo ============================================
echo   DONE! Ab Vercel deploy ke liye ye chalao:
echo   npx vercel --prod
echo ============================================
pause
