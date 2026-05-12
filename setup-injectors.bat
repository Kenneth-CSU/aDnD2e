@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo AD&D 2e Character System - Data Enrichment Setup
echo ============================================================
echo.

REM Check for required files
if not exist "books\FullTextSearch.txt" (
    echo ERROR: books\FullTextSearch.txt not found
    echo Please ensure you are running this from the project root directory
    pause
    exit /b 1
)

if not exist "data\classes.json" (
    echo ERROR: data\classes.json not found
    echo Please ensure you are running this from the project root directory
    pause
    exit /b 1
)

REM Check PowerShell availability
where powershell >nul 2>nul
if !errorlevel! neq 0 (
    echo ERROR: PowerShell not found in PATH
    echo Please install PowerShell 5.1 or later
    pause
    exit /b 1
)

echo Found required files and PowerShell
echo.

REM Get PowerShell version to verify compatibility
for /f "tokens=*" %%i in ('powershell -Command "$PSVersionTable.PSVersion.Major"') do set PS_MAJOR=%%i
echo PowerShell version: !PS_MAJOR!.x
if !PS_MAJOR! lss 5 (
    echo WARNING: PowerShell 5.1+ recommended (found version !PS_MAJOR!)
)
echo.

REM Run injectors with execution policy bypass
echo Running trait injectors...
echo.

echo [1/4] Enriching class traits...
powershell -ExecutionPolicy Bypass -Command "& '.\scripts\inject-class-traits.ps1' -Rebuild"
if !errorlevel! neq 0 (
    echo ERROR: Class trait injection failed
    pause
    exit /b 1
)
echo.

echo [2/4] Enriching weapon traits...
powershell -ExecutionPolicy Bypass -Command "& '.\scripts\inject-weapons-traits.ps1' -Rebuild"
if !errorlevel! neq 0 (
    echo ERROR: Weapon trait injection failed
    pause
    exit /b 1
)
echo.

echo [3/4] Enriching item traits...
powershell -ExecutionPolicy Bypass -Command "& '.\scripts\inject-items-traits.ps1' -Rebuild"
if !errorlevel! neq 0 (
    echo ERROR: Item trait injection failed
    pause
    exit /b 1
)
echo.

echo [4/4] Enriching armour traits...
powershell -ExecutionPolicy Bypass -Command "& '.\scripts\inject-armour-traits.ps1' -Rebuild"
if !errorlevel! neq 0 (
    echo ERROR: Armour trait injection failed
    pause
    exit /b 1
)
echo.

echo ============================================================
echo All trait injections completed successfully!
echo ============================================================
echo.
echo Generated trace reports:
echo   - data\classTraitTrace.json
echo   - data\weaponsTraitTrace.json
echo   - data\itemsTraitTrace.json
echo   - data\armourTraitTrace.json
echo.
echo Updated data files:
echo   - data\classes.json
echo   - data\weapons.json
echo   - data\items.json
echo   - data\armour.json
echo.
echo You can now run setup.bat to start the HTTP server
echo.
pause
