@echo off
rem Builds the driver setup utility with the C# compiler bundled with .NET Framework 4.x
rem (present on every Windows 10/11). Output: tools\setup\bin\XprinterSetup.exe
setlocal
set FW=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319
cd /d "%~dp0"
if not exist bin mkdir bin
"%FW%\csc.exe" /nologo /target:winexe /platform:anycpu /optimize+ /codepage:65001 ^
  /win32manifest:app.manifest ^
  /r:"%FW%\System.Management.dll" /r:"%FW%\System.Web.Extensions.dll" ^
  /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Core.dll ^
  /out:bin\XprinterSetup.exe XprinterSetup.cs
