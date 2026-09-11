// ======================================================
// 🗄️ src-tauri/src back_tray.rs
// ------------------------------------------------------
// Ícono de bandeja de sistema y su menú contextual.
//
// Ids fijos del menú: "abrir", "toggle_perfil", "titulo_perfiles",
// "salir". Los perfiles llevan id dinámico "perfil::<nombre>".
//
// El TrayIcon se guarda en el estado gestionado de Tauri
// (app.manage) para poder llamarle set_menu() después de
// inicializar(). El menú se reconstruye por completo (estado real,
// nunca asumido) cada vez que cambia algo relevante: acción propia
// del menú (refrescar_menu) o acción externa vía atajo global /
// ventana principal (refrescar_si_existe, resuelta contra el
// AppHandle global de este módulo — ver entrada.rs y comandos.rs).
// ======================================================

use crate::{cache, config, perfil, pulsadores};
use std::sync::OnceLock;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

// ======================================================
// 🌐 APPHANDLE GLOBAL
// ------------------------------------------------------
// Mismo patrón que back_notificacion::inicializar/app_handle: se
// fija una única vez, apenas Tauri termina de inicializar (lib.rs).
// Permite refrescar el menú desde módulos sin AppHandle propio
// (entrada.rs corre en su propio hilo, sin comando Tauri de por
// medio) — ver refrescar_si_existe().
// ======================================================

static APP: OnceLock<AppHandle> = OnceLock::new();

pub fn inicializar(app: &AppHandle) {
    let _ = APP.set(app.clone());

    let icono = app
        .default_window_icon()
        .expect("Falta el ícono default de la app (icons/icon.ico)")
        .clone();

    let menu = reconstruir_menu(app);

    let tray = TrayIconBuilder::new()
        .icon(icono)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(manejar_evento_menu)
        .on_tray_icon_event(manejar_evento_icono)
        .build(app)
        .expect("No se pudo crear el ícono de bandeja de sistema");

    app.manage(tray);
}

// ======================================================
// 🧱 CONSTRUCCIÓN DEL MENÚ (estado real)
// ------------------------------------------------------
// Arma el Menu completo desde cero, leyendo el estado real en el
// momento de la llamada (cache::esta_vacia(), atajo configurado) —
// nunca un estado asumido de antemano.
// ======================================================

fn reconstruir_menu(app: &AppHandle) -> Menu<tauri::Wry> {
    let item_abrir = MenuItem::with_id(app, "abrir", "Abrir Omega Ctrl", true, None::<&str>)
        .expect("No se pudo crear el ítem 'Abrir Omega Ctrl' del menú de bandeja");

    let item_toggle_perfil = MenuItem::with_id(
        app,
        "toggle_perfil",
        texto_toggle_perfil(),
        true,
        None::<&str>,
    )
    .expect("No se pudo crear el ítem de Activar/Desactivar Perfil del menú de bandeja");

    // Subtítulo "Perfiles:" — deshabilitado, sin acción propia.
    let item_titulo_perfiles =
        MenuItem::with_id(app, "titulo_perfiles", "Perfiles:", false, None::<&str>)
            .expect("No se pudo crear el subtítulo 'Perfiles:' del menú de bandeja");

    let item_salir = MenuItem::with_id(app, "salir", "Salir", true, None::<&str>)
        .expect("No se pudo crear el ítem 'Salir' del menú de bandeja");

    let separador_1 = PredefinedMenuItem::separator(app)
        .expect("No se pudo crear el separador del menú de bandeja");
    let separador_2 = PredefinedMenuItem::separator(app)
        .expect("No se pudo crear el separador del menú de bandeja");
    let separador_3 = PredefinedMenuItem::separator(app)
        .expect("No se pudo crear el separador del menú de bandeja");

    let nombres_perfiles = perfil::obtener_perfiles().unwrap_or_default();
    let nombre_actual = perfil::obtener_nombre_actual().ok();

    let items_perfiles: Vec<MenuItem<tauri::Wry>> = nombres_perfiles
        .iter()
        .map(|nombre| {
            let es_actual = nombre_actual.as_deref() == Some(nombre.as_str());
            crear_item_perfil(app, nombre, es_actual)
        })
        .collect();

    let mut items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = vec![
        &item_abrir,
        &item_toggle_perfil,
        &separador_1,
        &item_titulo_perfiles,
    ];

    for item in &items_perfiles {
        items.push(item);
    }

    items.push(&separador_2);
    items.push(&separador_3);
    items.push(&item_salir);

    Menu::with_items(app, &items).expect("No se pudo armar el menú de bandeja")
}

/// Reconstruye el menú y se lo reasigna al TrayIcon ya existente
/// (guardado en el estado gestionado por inicializar()).
pub fn refrescar_menu(app: &AppHandle) {
    let menu = reconstruir_menu(app);
    let tray = app.state::<TrayIcon>();
    let _ = tray.set_menu(Some(menu));
}

/// Mismo refresco que refrescar_menu(), pero resolviendo el
/// AppHandle desde el estático global — para llamar desde módulos
/// sin AppHandle a mano (ej. entrada.rs, comandos.rs). No hace nada
/// si Tauri todavía no terminó de inicializar (AppHandle ausente) o
/// si el TrayIcon aún no se creó.
pub fn refrescar_si_existe() {
    if let Some(app) = APP.get() {
        refrescar_menu(app);
    }
}

// ======================================================
// 🔤 TEXTO DEL ÍTEM ACTIVAR/DESACTIVAR PERFIL
// ------------------------------------------------------
// "Activar Perfil" si la cache está vacía (perfil inactivo),
// "Desactivar Perfil" si no — mismo criterio que decide qué mostrar
// la notificación tras el fix de entrada.rs. Se le concatena el
// atajo real configurado (config::tecla_toggle_perfil()).
// ======================================================

fn texto_toggle_perfil() -> String {
    let accion = if cache::esta_vacia() {
        "Activar Perfil"
    } else {
        "Desactivar Perfil"
    };

    format!("{accion} ({})", formatear_atajo(&config::tecla_toggle_perfil()))
}

/// Arma el texto legible de un AtajoSimple, ej. "Ctrl+F1" — mismos
/// nombres "bonitos" que ya usa la UI (pulsadores::nombre_ui_efectivo),
/// para no duplicar tabla de nombres.
fn formatear_atajo(atajo: &config::AtajoSimple) -> String {
    let mut partes: Vec<String> = atajo
        .modificadores
        .iter()
        .map(|modificador| pulsadores::nombre_ui_efectivo(modificador.control().unwrap_or("")))
        .collect();

    partes.push(pulsadores::nombre_ui_efectivo(
        atajo.gatillo.control().unwrap_or(""),
    ));

    partes.join("+")
}

// ======================================================
// 🎚️ TOGGLE DE PERFIL DESDE LA BANDEJA
// ------------------------------------------------------
// Misma lógica que entrada::ejecutar_toggle_perfil() (activar si la
// cache está vacía, si no desactivar), sin disparar la notificación
// de ventana — el clic en este ítem ya es, en sí mismo, la
// confirmación visual (Regla 6: mismo comportamiento que el botón
// verde de la ventana principal).
// ======================================================

fn ejecutar_toggle_perfil_tray() {
    if cache::esta_vacia() {
        if let Err(error) = perfil::activar_perfil() {
            eprintln!("⚠️ Bandeja: no se pudo activar el perfil: {error}");
        }
    } else {
        perfil::desactivar_perfil();
    }
}

// ======================================================
// 🟢🔴 LISTA DE PERFILES (ítems dinámicos del menú)
// ------------------------------------------------------
// Cada perfil lleva un id "perfil::<nombre>" para distinguirlo en
// manejar_evento_menu. El marcador de color va antepuesto al texto
// (Tauri no soporta ícono nativo por ítem de forma simple en un Menu
// estándar): círculo verde si es el actual y quedó realmente activo,
// rojo si es el actual pero la cache sigue vacía, o un espacio en
// blanco de igual ancho si no es el actual — así el nombre queda
// alineado en toda la lista (Regla: "toda la lista de perfiles
// aparece desplazada para que los nombres queden alineados").
// ======================================================

const MARCADOR_VACIO: &str = "\u{2003}"; // espacio de igual ancho visual que 🟢/🔴

fn crear_item_perfil(app: &AppHandle, nombre: &str, es_actual: bool) -> MenuItem<tauri::Wry> {
    let marcador = if !es_actual {
        MARCADOR_VACIO
    } else if cache::esta_vacia() {
        "🔴"
    } else {
        "🟢"
    };

    let id = format!("perfil::{nombre}");
    let texto = format!("{marcador} {nombre}");

    MenuItem::with_id(app, id, texto, true, None::<&str>)
        .expect("No se pudo crear el ítem de perfil del menú de bandeja")
}

fn manejar_evento_icono(tray: &tauri::tray::TrayIcon, evento: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        ..
    } = evento
    {
        restaurar_ventana_principal(tray.app_handle());
    }
}

/// Cambia al perfil `nombre` (Regla 11): si ya es el actual, no hace
/// nada (Regla 10). Si es distinto, desactiva el actual y activa el
/// seleccionado vía perfil::seleccionar_perfil (toca el mtime en
/// disco para que pase a ser "el actual" y compila/activa de una).
/// Un error no se propaga a la UI — el color rojo del próximo
/// reconstruir_menu ya refleja que no quedó activo.
fn ejecutar_seleccionar_perfil_tray(nombre: &str) {
    if perfil::obtener_nombre_actual().ok().as_deref() == Some(nombre) {
        return;
    }

    if let Err(error) = perfil::seleccionar_perfil(nombre.to_string()) {
        eprintln!("⚠️ Bandeja: no se pudo cambiar al perfil '{nombre}': {error}");
    }
}

fn manejar_evento_menu(app: &AppHandle, evento: tauri::menu::MenuEvent) {
    let id = evento.id().as_ref();

    match id {
        "abrir" => restaurar_ventana_principal(app),

        "toggle_perfil" => {
            ejecutar_toggle_perfil_tray();
            refrescar_menu(app);
        }

        "salir" => app.exit(0),

        _ => {
            if let Some(nombre) = id.strip_prefix("perfil::") {
                ejecutar_seleccionar_perfil_tray(nombre);
                refrescar_menu(app);
            }
        }
    }
}

fn restaurar_ventana_principal(app: &AppHandle) {
    if let Some(ventana) = app.get_webview_window("main") {
        let _ = ventana.show();
        let _ = ventana.unminimize();
        let _ = ventana.set_focus();
    }
}
