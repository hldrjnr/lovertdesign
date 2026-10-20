; Lovert Design — Inno Setup Script (build limpo anti-falso-positivo)
; Build limpo: set GUMROAD_PRODUCT_ID=... & set DISCORD_WEBHOOK_URL=... & iscc /DAppVersion=1.1.0 installer.iss
; Teste: strings dist\LovertDesign-Setup-*.exe | findstr discord → deve retornar vazio
; Para assinar: iscc /Ssigntool="signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a $f" installer.iss

#define AppVersion "1.1.0"

[Setup]
AppName=Lovert Design
AppVersion={#AppVersion}
AppPublisher=HldrJnr
AppPublisherURL=https://github.com/HldrJnr
AppId={{8E2B4B6A-9F3D-4A1B-8C2D-5E6F7A8B9C0D}
DefaultDirName={autopf}\Lovert Design
DefaultGroupName=Lovert Design
OutputDir=dist
OutputBaseFilename=LovertDesign-Setup-{#AppVersion}
SetupIconFile=src-tauri\icons\icon.ico
UninstallDisplayIcon={app}\lovert-design.exe
; lzma/fast em vez de lzma2/ultra — ultra aumenta entropia e dispara BEHAVESLIKE.WIN32OBFUSCATEDPOLY
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ChangesEnvironment=yes
UninstallDisplayName=Lovert Design
VersionInfoVersion={#AppVersion}.0
VersionInfoCompany=HldrJnr
VersionInfoDescription=Thumbnail & Banner Design Tool
VersionInfoCopyright=Copyright (C) 2024 HldrJnr
MinVersion=10.0
ArchitecturesInstallIn64BitMode=x64
; Descomente para assinar automaticamente (requer certificado instalado)
;SignTool=signtool
;SignedUninstaller=yes

[Languages]
Name: "portuguese"; MessagesFile: "compiler:Languages\Portuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho no Ambiente de Trabalho"; GroupDescription: "Atalhos:"; Flags: checkedonce
Name: "associatefiles"; Description: "Associar ficheiros .lovd ao Lovert Design"; GroupDescription: "Ficheiros:"; Flags: checkedonce

[Files]
; Aplicacao principal
Source: "src-tauri\target\release\lovert-design.exe"; DestDir: "{app}"; Flags: ignoreversion
; DLLs nativas necessarias
Source: "src-tauri\target\release\*.dll"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
; Recursos Tauri (icones, etc.)
Source: "src-tauri\target\release\resources\*"; DestDir: "{app}\resources"; Flags: recursesubdirs skipifsourcedoesntexist
; Sidecar de remocao de fundo (nao empacotado: feature IA e opcional no cliente)
Source: "src-tauri\target\release\thumbnail-sidecar.exe"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
; WebView2 bootstrapper (instalado temporariamente)
Source: "src-tauri\WebView2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{group}\Lovert Design"; Filename: "{app}\lovert-design.exe"; WorkingDir: "{app}"
Name: "{group}\Desinstalar Lovert Design"; Filename: "{uninstallexe}"
Name: "{commondesktop}\Lovert Design"; Filename: "{app}\lovert-design.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\lovert-design.exe"; Description: "Executar Lovert Design"; Flags: postinstall nowait skipifsilent unchecked

[Registry]
; File association: .lovd extension
Root: HKCR; Subkey: ".lovd"; ValueType: string; ValueName: ""; ValueData: "LovertDesignProject"; Flags: uninsdeletevalue; Tasks: associatefiles
Root: HKCR; Subkey: ".lovd"; ValueType: string; ValueName: "Content Type"; ValueData: "application/json"; Flags: uninsdeletevalue; Tasks: associatefiles

; File type description
Root: HKCR; Subkey: "LovertDesignProject"; ValueType: string; ValueName: ""; ValueData: "Lovert Design Project"; Flags: uninsdeletekey; Tasks: associatefiles
Root: HKCR; Subkey: "LovertDesignProject\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\lovert-design.exe,0"; Tasks: associatefiles
Root: HKCR; Subkey: "LovertDesignProject\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\lovert-design.exe"" ""%1"""; Tasks: associatefiles

; Also register for .json files that are Lovert templates
Root: HKCR; Subkey: "LovertDesignProject"; ValueType: string; ValueName: "FriendlyTypeName"; ValueData: "Lovert Design Project"; Tasks: associatefiles

[Code]
function IsWebView2Installed: Boolean;
var
  Version: string;
begin
  Result := RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version);
  if not Result then
    Result := RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version);
  if not Result then
    Result := RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version);
  if not Result then
    Result := RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    Log('Verificando WebView2 Runtime...');
    if not IsWebView2Installed then
    begin
      Log('WebView2 Runtime nao encontrado. A instalar...');
      if Exec(ExpandConstant('{tmp}\WebView2Setup.exe'), '/silent /install', '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then
      begin
        if ResultCode = 0 then
          Log('WebView2 Runtime instalado com sucesso.')
        else
          Log('Instalador WebView2 terminou com codigo: ' + IntToStr(ResultCode));
      end
      else
        Log('Falha ao executar o instalador WebView2.');
    end
    else
      Log('WebView2 Runtime ja instalado.');
  end;
end;
