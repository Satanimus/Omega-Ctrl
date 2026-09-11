// ======================================================
// 👤 USUARIO
// ======================================================
// 1. ¿Qué hace este archivo?
// Dueño de las rutas y archivos del usuario:
//
// Usuario/
//   ├── Perfiles/
//   │     ├── perfil_Default.json
//   │     ├── perfil_Juegos.json
//   │     └── ...
//   ├── Portapapeles/
//   └── Themes/
//
// Resuelve la carpeta Usuario, busca perfiles guardados
// en disco y decide cuál es el perfil actual (siempre el
// JSON modificado más recientemente; si no existe ninguno,
// usa Default).
//
// No conoce Runtime.
// No conoce Cache.
// No compila perfiles.
// ------------------------------------------------------
// 2. ¿Quién llama este archivo?
// perfil.rs (todas las operaciones de perfil pasan por
// acá para resolver rutas y nombres)
// ------------------------------------------------------
// 3. ¿Qué información recibe?
// Nombres de perfil (String) para ubicar o validar una
// ruta, o ninguna información (para listar/detectar el
// perfil actual).
// ------------------------------------------------------
// 4. ¿Qué información entrega?
// Rutas (PathBuf) y nombres (String) de perfiles.
// Ejemplo:
// ruta_perfil("Juegos")
//     → Usuario/perfil_Juegos.json
// ------------------------------------------------------
// 5. Funciones del archivo
// carpeta()
//     Resuelve (y crea si no existe) la carpeta Usuario.
// rutas_perfiles()
//     Lista las rutas de todos los perfiles guardados.
// perfiles()
//     Lista los nombres de todos los perfiles guardados.
// es_perfil()
//     Determina si una ruta es un archivo de perfil.
// nombre_desde_ruta()
//     Extrae el nombre de perfil desde su ruta.
// ruta_perfil()
//     Arma la ruta de un perfil a partir de su nombre.
// perfil_default()
//     Ruta del perfil "Default".
// perfil_actual()
//     Ruta del perfil modificado más recientemente
//     (o Default si no existe ninguno).
// nombre_actual()
//     Nombre del perfil actual.
// ------------------------------------------------------
// Transformación que realiza
// %APPDATA%
//     ↓
// Usuario/Perfiles/
//     ↓
// perfil_actual() → perfil_Juegos.json
// ======================================================

use crate::config;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::path::BaseDirectory;
use tauri::Manager;

// ======================================================
// 📁 OBTENER CARPETA USUARIO
// ======================================================

pub(crate) fn carpeta() -> Result<PathBuf, String> {
    if let Some(carpeta) = carpeta_junto_a_exe() {
        return Ok(carpeta);
    }

    let destino = match leer_override() {
        Some(destino) => destino,
        None => carpeta_default()?,
    };

    let carpeta = destino.join("Usuario");

    fs::create_dir_all(&carpeta).map_err(|error| error.to_string())?;

    Ok(carpeta)
}

// Destino padre por defecto (%APPDATA%\NOMBRE_APP), sin el "Usuario"
// final — mismo criterio que carpeta_instalacion() y un override
// "Otra". Expuesta para que el comando de Configuración pueda
// mostrar/usar esta ruta como una de las 3 opciones del selector.
pub(crate) fn carpeta_default() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|error| error.to_string())?;

    Ok(PathBuf::from(appdata).join(config::NOMBRE_APP))
}

// Si ya existe una carpeta "Usuario" al lado del .exe actual, es
// portable y manda por sobre cualquier otra fuente (Regla 1/2).
fn carpeta_junto_a_exe() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let carpeta = exe.parent()?.join("Usuario");

    carpeta.is_dir().then_some(carpeta)
}

// Marcador fijo en AppData (independiente de la carpeta Usuario que
// resuelve), donde Configuración guarda la carpeta destino elegida
// por el usuario (Regla 4) — el padre de "Usuario", no "Usuario"
// mismo (mismo criterio que Default e Instalación). Contiene la
// ruta absoluta en texto plano.
fn ruta_override() -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").ok()?;

    Some(
        PathBuf::from(appdata)
            .join(config::NOMBRE_APP)
            .join("ubicacion.txt"),
    )
}

pub(crate) fn leer_override() -> Option<PathBuf> {
    let contenido = fs::read_to_string(ruta_override()?).ok()?;
    let contenido = contenido.trim();

    (!contenido.is_empty()).then(|| PathBuf::from(contenido))
}

// ======================================================
// ⚙️ OVERRIDE DE CARPETA DE USUARIO (Configuración)
// ------------------------------------------------------
// guardar_override()/quitar_override() son los únicos
// puntos de escritura de ubicacion.txt (Regla 3/4). No
// migran nada — eso es responsabilidad de la Etapa C,
// que llama a estas funciones recién después de migrar.
// ======================================================

pub(crate) fn guardar_override(destino: &Path) -> Result<(), String> {
    let ruta = ruta_override().ok_or("No se pudo resolver %APPDATA%")?;

    if let Some(padre) = ruta.parent() {
        fs::create_dir_all(padre).map_err(|error| error.to_string())?;
    }

    fs::write(&ruta, destino.to_string_lossy().as_bytes()).map_err(|error| error.to_string())
}

pub(crate) fn quitar_override() -> Result<(), String> {
    let Some(ruta) = ruta_override() else {
        return Ok(());
    };

    match fs::remove_file(&ruta) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

// Carpeta del .exe, para la opción "Carpeta de instalación OmegaCtrl"
// del selector — destino padre, igual que Default y un override
// "Otra" (Regla 6): "Usuario" se crea/migra debajo de esta carpeta.
pub(crate) fn carpeta_instalacion() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;

    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "No se pudo resolver la carpeta del ejecutable".to_string())
}

// Confirma que se puede crear/escribir/borrar en la carpeta (Regla 9).
pub(crate) fn validar_carpeta_escribible(carpeta: &Path) -> Result<(), String> {
    fs::create_dir_all(carpeta).map_err(|error| error.to_string())?;

    let archivo_prueba = carpeta.join(".omegactrl_test");

    fs::write(&archivo_prueba, b"").map_err(|error| error.to_string())?;

    fs::remove_file(&archivo_prueba).map_err(|error| error.to_string())
}

// Detecta si la carpeta cae dentro de una carpeta de sistema típica
// (Program Files, Program Files (x86), Windows) para mostrar el
// aviso de modo administrador (Regla 8).
pub(crate) fn es_carpeta_sistema(carpeta: &Path) -> bool {
    let claves = ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "windir"];

    let objetivo = carpeta.to_string_lossy().to_lowercase();

    claves.iter().any(|clave| {
        std::env::var(clave)
            .map(|ruta| objetivo.starts_with(&ruta.to_lowercase()))
            .unwrap_or(false)
    })
}

// ======================================================
// 🚚 MIGRACIÓN DE CARPETA USUARIO (Regla 10/11)
// ------------------------------------------------------
// Puro backend: no decide qué hacer ante un conflicto ni
// ante la carpeta antigua, solo ejecuta lo que la Etapa E
// (comandos) le indique tras la respuesta del usuario en
// los popups de la Etapa H.
// ======================================================

// ¿El destino ya tiene una carpeta "Usuario" con contenido? (Regla 11)
pub(crate) fn destino_usuario_no_vacio(destino: &Path) -> bool {
    let carpeta = destino.join("Usuario");

    fs::read_dir(&carpeta)
        .map(|mut entradas| entradas.next().is_some())
        .unwrap_or(false)
}

pub(crate) fn renombrar_usuario_existente(destino: &Path) -> Result<(), String> {
    let actual = destino.join("Usuario");
    let respaldo = destino.join("usuario_old");

    if respaldo.exists() {
        fs::remove_dir_all(&respaldo).map_err(|error| error.to_string())?;
    }

    fs::rename(&actual, &respaldo).map_err(|error| error.to_string())
}

pub(crate) fn eliminar_usuario_existente(destino: &Path) -> Result<(), String> {
    let actual = destino.join("Usuario");

    fs::remove_dir_all(&actual).map_err(|error| error.to_string())
}

// Copia la carpeta Usuario actual (según carpeta(), antes de guardar
// el override) a destino/Usuario. Debe llamarse ANTES de
// guardar_override(), o el origen y el destino coincidirían.
pub(crate) fn migrar_usuario(destino: &Path) -> Result<(), String> {
    let origen = carpeta()?;
    let destino_usuario = destino.join("Usuario");

    copiar_directorio_recursivo(&origen, &destino_usuario)
}

// Borra una carpeta Usuario ya migrada (Regla 10, opción "Eliminar"
// sobre la ruta antigua). Recibe la ruta ya resuelta de antemano
// (capturada antes de guardar_override) — carpeta() a esta altura
// ya apunta al destino nuevo.
pub(crate) fn eliminar_carpeta(carpeta: &Path) -> Result<(), String> {
    fs::remove_dir_all(carpeta).map_err(|error| error.to_string())
}

// "Mantener" sobre la carpeta antigua cuando esta era la portable
// junto al exe: no puede seguir llamándose "Usuario" o la Regla 1
// la vuelve a tomar en el próximo arranque e ignora el override
// recién guardado. Se renombra a "Usuario_old" junto al exe.
pub(crate) fn renombrar_a_usuario_old(carpeta: &Path) -> Result<(), String> {
    let destino = carpeta
        .parent()
        .ok_or("No se pudo resolver la carpeta contenedora")?
        .join("Usuario_old");

    if destino.exists() {
        fs::remove_dir_all(&destino).map_err(|error| error.to_string())?;
    }

    fs::rename(carpeta, destino).map_err(|error| error.to_string())
}

fn copiar_directorio_recursivo(origen: &Path, destino: &Path) -> Result<(), String> {
    fs::create_dir_all(destino).map_err(|error| error.to_string())?;

    for entrada in fs::read_dir(origen).map_err(|error| error.to_string())? {
        let entrada = entrada.map_err(|error| error.to_string())?;
        let ruta_origen = entrada.path();
        let ruta_destino = destino.join(entrada.file_name());

        let tipo = entrada.file_type().map_err(|error| error.to_string())?;

        if tipo.is_dir() {
            copiar_directorio_recursivo(&ruta_origen, &ruta_destino)?;
        } else {
            fs::copy(&ruta_origen, &ruta_destino).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

// ======================================================
// 📁 SUBCARPETAS DE USUARIO
// ------------------------------------------------------
// Perfiles, Portapapeles y Themes viven todas dentro de
// la carpeta Usuario (antes Portapapeles vivía suelta al
// lado de Usuario, y los perfiles sueltos dentro de
// Usuario). Este archivo es el único dueño de estas
// rutas — back_portapapeles.rs y configuracion_usuario.rs
// las consultan acá en vez de resolver APPDATA por su
// cuenta.
// ======================================================

pub(crate) fn carpeta_perfiles() -> Result<PathBuf, String> {
    let carpeta = carpeta()?.join("Perfiles");

    fs::create_dir_all(&carpeta).map_err(|error| error.to_string())?;

    Ok(carpeta)
}

pub(crate) fn carpeta_portapapeles() -> Result<PathBuf, String> {
    let carpeta = carpeta()?.join("Portapapeles");

    fs::create_dir_all(&carpeta).map_err(|error| error.to_string())?;

    Ok(carpeta)
}

pub(crate) fn carpeta_temas() -> Result<PathBuf, String> {
    let carpeta = carpeta()?.join("Themes");

    fs::create_dir_all(&carpeta).map_err(|error| error.to_string())?;

    Ok(carpeta)
}

// ======================================================
// 📁 CARPETA DE TEMAS DEL PROGRAMA (solo lectura)
// ------------------------------------------------------
// Vive junto al ejecutable (recurso empaquetado por Tauri,
// declarado en tauri.conf.json → bundle.resources), no
// dentro de Usuario/. Acá viven los temas predefinidos
// (Default.theme y cualquier .theme que se agregue a mano);
// el usuario nunca escribe en esta carpeta desde la app.
// ======================================================

pub(crate) fn carpeta_temas_programa(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve("themes", BaseDirectory::Resource)
        .map_err(|error| error.to_string())
}

// ======================================================
// 🎨 LISTAR TEMAS DEL PROGRAMA (predefinidos)
// ------------------------------------------------------
// Cualquier .theme presente en esta carpeta cuenta como
// predefinido — no hay lista hardcodeada de nombres, ver
// configuracion_usuario.rs::es_tema_predefinido/listar_temas.
// ======================================================

pub(crate) fn temas_programa(app: &tauri::AppHandle) -> Result<Vec<String>, String> {
    let carpeta = carpeta_temas_programa(app)?;

    let mut nombres = Vec::new();

    let entradas = fs::read_dir(&carpeta).map_err(|error| error.to_string())?;

    for entrada in entradas {
        let ruta = entrada.map_err(|error| error.to_string())?.path();

        let Some(nombre) = ruta.file_name().and_then(|nombre| nombre.to_str()) else {
            continue;
        };

        let Some(nombre) = nombre.strip_suffix(".theme") else {
            continue;
        };

        nombres.push(nombre.to_string());
    }

    nombres.sort();

    Ok(nombres)
}

// ======================================================
// 📄 RUTA CATÁLOGO DE COORDENADAS
// ------------------------------------------------------
// Archivo único directo en Usuario/ (no tiene subcarpeta
// propia, a diferencia de Perfiles/Portapapeles/Themes) —
// ver banco_coordenadas.rs.
// ======================================================

pub(crate) fn ruta_coordenadas() -> Result<PathBuf, String> {
    Ok(carpeta()?.join("Coordenadas.tsv"))
}

// ======================================================
// 📄 BUSCAR PERFILES
// ======================================================

fn rutas_perfiles() -> Result<Vec<PathBuf>, String> {
    let carpeta = carpeta_perfiles()?;

    let mut perfiles = Vec::new();

    let entradas = fs::read_dir(&carpeta).map_err(|error| error.to_string())?;

    for entrada in entradas {
        let ruta = entrada.map_err(|error| error.to_string())?.path();

        if !es_perfil(&ruta) {
            continue;
        }

        perfiles.push(ruta);
    }

    Ok(perfiles)
}

// ======================================================
// 📋 LISTAR PERFILES
// ======================================================

pub fn perfiles() -> Result<Vec<String>, String> {
    let mut nombres = rutas_perfiles()?
        .into_iter()
        .filter_map(|ruta| nombre_desde_ruta(&ruta))
        .collect::<Vec<_>>();

    nombres.sort();

    Ok(nombres)
}

// ======================================================
// 🔎 ES PERFIL
// ======================================================

fn es_perfil(ruta: &Path) -> bool {
    let Some(nombre) = ruta.file_name().and_then(|nombre| nombre.to_str()) else {
        return false;
    };

    nombre.starts_with("perfil_") && nombre.ends_with(".json")
}

// ======================================================
// 🆔 NOMBRE DESDE RUTA
// ======================================================

fn nombre_desde_ruta(ruta: &Path) -> Option<String> {
    let nombre = ruta.file_name()?.to_str()?;

    let nombre = nombre.strip_prefix("perfil_")?.strip_suffix(".json")?;

    Some(nombre.to_string())
}

// ======================================================
// 📍 RUTA POR NOMBRE
// ======================================================

pub fn ruta_perfil(nombre: &str) -> Result<PathBuf, String> {
    if nombre.trim().is_empty() {
        return Err("El nombre del perfil está vacío".to_string());
    }

    if nombre.contains('/') || nombre.contains('\\') || nombre == "." || nombre == ".." {
        return Err("Nombre de perfil inválido".to_string());
    }

    Ok(carpeta_perfiles()?.join(format!("perfil_{}.json", nombre)))
}

// ======================================================
// 🆕 PERFIL DEFAULT
// ======================================================

fn perfil_default() -> Result<PathBuf, String> {
    ruta_perfil("Default")
}

// ======================================================
// 🕒 PERFIL ACTUAL
// ======================================================

pub fn perfil_actual() -> Result<PathBuf, String> {
    let perfiles = rutas_perfiles()?;

    let Some(perfil) = perfiles.into_iter().max_by_key(|ruta| {
        fs::metadata(ruta)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH)
    }) else {
        return perfil_default();
    };

    Ok(perfil)
}

// ======================================================
// 🆔 NOMBRE PERFIL ACTUAL
// ======================================================

pub fn nombre_actual() -> Result<String, String> {
    let ruta = perfil_actual()?;

    nombre_desde_ruta(&ruta).ok_or_else(|| "No se pudo determinar el nombre del perfil".to_string())
}

// ======================================================
// 🎨 LISTAR TEMAS DE USUARIO
// ======================================================

pub(crate) fn temas() -> Result<Vec<String>, String> {
    let carpeta = carpeta_temas()?;

    let mut nombres = Vec::new();

    let entradas = fs::read_dir(&carpeta).map_err(|error| error.to_string())?;

    for entrada in entradas {
        let ruta = entrada.map_err(|error| error.to_string())?.path();

        let Some(nombre) = ruta.file_name().and_then(|nombre| nombre.to_str()) else {
            continue;
        };

        let Some(nombre) = nombre.strip_suffix(".theme") else {
            continue;
        };

        nombres.push(nombre.to_string());
    }

    nombres.sort();

    Ok(nombres)
}
