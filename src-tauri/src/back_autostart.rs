// ======================================================
// 🚀 src-tauri/src back_autostart.rs
// ------------------------------------------------------
// "Iniciar con Windows" (Configuración → General).
//
// - Ejecutándose como administrador: tarea programada
//   "Al iniciar sesión" con privilegios más altos (la clave
//   Run de Windows omite en silencio los programas que piden
//   elevación, así que no sirve para ese caso).
// - Sin privilegios: clave HKCU\...\Run (sin elevación).
//
// En ambos casos el exe se lanza con ARG_AUTOSTART, para poder
// distinguir un arranque de Windows de uno manual.
// ======================================================

use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
use winreg::RegKey;

pub const ARG_AUTOSTART: &str = "--autostart";

const NOMBRE_TAREA: &str = "OmegaCtrl_Autostart";
const CLAVE_RUN: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const VALOR_RUN: &str = "omegactrl";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn establecer(activo: bool) -> Result<(), String> {
    if activo {
        activar()
    } else {
        desactivar()
    }
}

fn es_administrador() -> bool {
    unsafe { windows_sys::Win32::UI::Shell::IsUserAnAdmin() != 0 }
}

fn ruta_exe() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|error| error.to_string())
}

fn activar() -> Result<(), String> {
    let exe = ruta_exe()?;

    if es_administrador() {
        crear_tarea(&exe)?;
        quitar_clave_run()
    } else {
        eliminar_tarea()?;
        escribir_clave_run(&exe)
    }
}

fn desactivar() -> Result<(), String> {
    eliminar_tarea()?;
    quitar_clave_run()
}

// ======================================================
// 🗝 Clave Run (sin privilegios)
// ======================================================

fn escribir_clave_run(exe: &std::path::Path) -> Result<(), String> {
    let clave = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(CLAVE_RUN, KEY_SET_VALUE)
        .map_err(|error| error.to_string())?;

    let comando = format!("\"{}\" {}", exe.display(), ARG_AUTOSTART);

    clave
        .set_value(VALOR_RUN, &comando)
        .map_err(|error| error.to_string())
}

fn quitar_clave_run() -> Result<(), String> {
    let clave = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(CLAVE_RUN, KEY_SET_VALUE)
        .map_err(|error| error.to_string())?;

    match clave.delete_value(VALOR_RUN) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

// ======================================================
// 📅 Tarea programada (administrador)
// ======================================================

fn schtasks() -> Command {
    let mut comando = Command::new("schtasks");
    comando.creation_flags(CREATE_NO_WINDOW);
    comando
}

fn tarea_existe() -> bool {
    schtasks()
        .args(["/Query", "/TN", NOMBRE_TAREA])
        .output()
        .map(|salida| salida.status.success())
        .unwrap_or(false)
}

fn eliminar_tarea() -> Result<(), String> {
    if !tarea_existe() {
        return Ok(());
    }

    let salida = schtasks()
        .args(["/Delete", "/TN", NOMBRE_TAREA, "/F"])
        .output()
        .map_err(|error| error.to_string())?;

    if salida.status.success() {
        Ok(())
    } else {
        Err(format!(
            "No se pudo quitar la tarea programada de inicio. Ejecuta el programa como administrador para desactivarla. {}",
            String::from_utf8_lossy(&salida.stderr).trim()
        ))
    }
}

fn escapar_xml(texto: &str) -> String {
    texto
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn crear_tarea(exe: &std::path::Path) -> Result<(), String> {
    let usuario = format!(
        "{}\\{}",
        std::env::var("USERDOMAIN").unwrap_or_default(),
        std::env::var("USERNAME").map_err(|error| error.to_string())?
    );
    let usuario = escapar_xml(&usuario);

    let carpeta = exe
        .parent()
        .map(|padre| padre.display().to_string())
        .unwrap_or_default();

    let xml = format!(
        r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>{usuario}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>{usuario}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{comando}</Command>
      <Arguments>{argumento}</Arguments>
      <WorkingDirectory>{carpeta}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>"#,
        usuario = usuario,
        comando = escapar_xml(&exe.display().to_string()),
        argumento = ARG_AUTOSTART,
        carpeta = escapar_xml(&carpeta),
    );

    // schtasks espera el XML en UTF-16 LE con BOM.
    let mut bytes: Vec<u8> = vec![0xFF, 0xFE];
    for unidad in xml.encode_utf16() {
        bytes.extend_from_slice(&unidad.to_le_bytes());
    }

    let archivo = std::env::temp_dir().join("omegactrl_autostart.xml");
    std::fs::write(&archivo, bytes).map_err(|error| error.to_string())?;

    let salida = schtasks()
        .args(["/Create", "/TN", NOMBRE_TAREA, "/XML"])
        .arg(&archivo)
        .arg("/F")
        .output();

    let _ = std::fs::remove_file(&archivo);

    let salida = salida.map_err(|error| error.to_string())?;

    if salida.status.success() {
        Ok(())
    } else {
        Err(format!(
            "No se pudo crear la tarea programada de inicio: {}",
            String::from_utf8_lossy(&salida.stderr).trim()
        ))
    }
}
