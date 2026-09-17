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
use tauri::image::Image;
use tauri::menu::{IconMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

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

pub fn inicializar(app: &AppHandle, visible: bool) {
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

    let _ = tray.set_visible(visible);

    app.manage(tray);
}

/// Muestra u oculta el ícono de bandeja ya creado, según "Mostrar en
/// bandeja de sistema" (Configuración → General). El TrayIcon se crea
/// siempre en inicializar() (oculto o visible); esto solo alterna su
/// visibilidad en caliente, sin crear ni destruir nada. No hace nada
/// si Tauri todavía no terminó de inicializar.
pub fn establecer_visible(visible: bool) {
    if let Some(app) = APP.get() {
        let tray = app.state::<TrayIcon>();
        let _ = tray.set_visible(visible);
    }
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

    let nombres_perfiles = perfil::obtener_perfiles().unwrap_or_default();
    let nombre_actual = perfil::obtener_nombre_actual().ok();

    let items_perfiles: Vec<IconMenuItem<tauri::Wry>> = nombres_perfiles
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

    format!(
        "{accion} ({})",
        formatear_atajo(&config::tecla_toggle_perfil())
    )
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
// confirmación visual (mismo comportamiento que el botón
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
// manejar_evento_menu.
//
// Bug fix: el marcador de color antes iba como emoji (🟢/🔴)
// antepuesto al texto. Los menús nativos de Windows (HMENU/GDI)
// dibujan el texto del ítem con la fuente clásica de menú, que no
// soporta glifos de emoji a color — el resultado es el glifo
// "tofu" (recuadro blanco achurado) que reportó el usuario, no el
// círculo de color. Se reemplaza por un IconMenuItem con un bitmap
// RGBA generado en memoria (ver icono_punto_estado) — un ícono real
// SÍ lo dibuja Windows correctamente, a diferencia del glifo emoji.
// Si no es el perfil actual, el ítem no lleva ícono (None).
// ======================================================

const TAMANO_ICONO_ESTADO: u32 = 12;
const COLOR_VERDE: [u8; 3] = [0x2e, 0xc4, 0x5c];
const COLOR_ROJO: [u8; 3] = [0xe0, 0x3b, 0x3b];

/// Genera un círculo relleno (antialiasing simple por cobertura de
/// borde) del color pedido, como bitmap RGBA cuadrado, para usarlo
/// como ícono de un IconMenuItem.
fn icono_punto_estado(color: [u8; 3]) -> Image<'static> {
    let n = TAMANO_ICONO_ESTADO;
    let mut buffer = vec![0u8; (n * n * 4) as usize];

    let centro = (n as f32 - 1.0) / 2.0;
    let radio = n as f32 / 2.0;

    for y in 0..n {
        for x in 0..n {
            let dx = x as f32 - centro;
            let dy = y as f32 - centro;
            let distancia = (dx * dx + dy * dy).sqrt();

            // Cobertura suave en el borde (1px) para no dejar el
            // círculo completamente dentado a este tamaño tan chico.
            let cobertura = (radio - distancia + 0.5).clamp(0.0, 1.0);

            let indice = ((y * n + x) * 4) as usize;

            buffer[indice] = color[0];
            buffer[indice + 1] = color[1];
            buffer[indice + 2] = color[2];
            buffer[indice + 3] = (cobertura * 255.0) as u8;
        }
    }

    Image::new_owned(buffer, n, n)
}

fn crear_item_perfil(app: &AppHandle, nombre: &str, es_actual: bool) -> IconMenuItem<tauri::Wry> {
    let icono = if !es_actual {
        None
    } else if cache::esta_vacia() {
        Some(icono_punto_estado(COLOR_ROJO))
    } else {
        Some(icono_punto_estado(COLOR_VERDE))
    };

    let id = format!("perfil::{nombre}");

    IconMenuItem::with_id(app, id, nombre, true, icono, None::<&str>)
        .expect("No se pudo crear el ítem de perfil del menú de bandeja")
}

fn manejar_evento_icono(tray: &tauri::tray::TrayIcon, evento: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        ..
    } = evento
    {
        mostrar_ventana_y_resincronizar(tray.app_handle());
    }
}

/// Pide al frontend que cambie de perfil. No fuerza mostrar la
/// ventana en cada click: la ventana solo debe aparecer
/// si el frontend encuentra ediciones sin guardar y necesita mostrar
/// el popup de confirmación (el propio frontend llama al comando
/// mostrar_ventana_principal en ese caso puntual, ver
/// comp_panel_lateral::cambiarPerfilDesde). Si no hay nada que
/// confirmar, el cambio se resuelve en segundo plano (la webview
/// sigue corriendo aunque la ventana esté oculta/minimizada) y recién
/// se ve reflejado cuando el usuario la abra. El menú de bandeja se
/// reconstruye recién cuando el frontend termina (seleccionar_perfil
/// ya llama back_tray::refrescar_si_existe, ver comandos.rs), no en
/// este click.
fn pedir_cambio_perfil_al_frontend(app: &AppHandle, nombre: &str) {
    if let Err(error) = app.emit("bandeja-seleccionar-perfil", nombre) {
        eprintln!("⚠️ Bandeja: no se pudo notificar el cambio de perfil al frontend: {error}");
    }
}

fn manejar_evento_menu(app: &AppHandle, evento: tauri::menu::MenuEvent) {
    let id = evento.id().as_ref();

    match id {
        "abrir" => mostrar_ventana_y_resincronizar(app),

        "toggle_perfil" => {
            ejecutar_toggle_perfil_tray();
            refrescar_menu(app);
        }

        "salir" => app.exit(0),

        _ => {
            if let Some(nombre) = id.strip_prefix("perfil::") {
                pedir_cambio_perfil_al_frontend(app, nombre);
            }
        }
    }
}

/// Solo muestra/enfoca la ventana principal, sin avisar al frontend.
/// También se usa desde comandos::mostrar_ventana_principal,
/// llamado por el frontend cuando el cambio de perfil (origen bandeja)
/// encuentra ediciones sin guardar y va a mostrar el popup de
/// confirmación — recién ahí se justifica robar foco/mostrar ventana.
pub(crate) fn solo_mostrar_ventana(app: &AppHandle) {
    if let Some(ventana) = app.get_webview_window("main") {
        // Revierte el set_skip_taskbar(true) aplicado al minimizar a
        // bandeja — si nunca se aplicó, no tiene efecto.
        let _ = ventana.set_skip_taskbar(false);
        let _ = ventana.show();
        let _ = ventana.unminimize();
        let _ = ventana.set_focus();
    }
}

/// Muestra/restaura la ventana principal y avisa al frontend para
/// que resincronice perfil actual, tabla y estado activo/inactivo
/// por si cambiaron mientras estaba minimizada — sin
/// agregar ningún polling nuevo. Usar solo cuando NO hay, además, un
/// cambio de perfil de por medio (ver pedir_cambio_perfil_al_frontend).
fn mostrar_ventana_y_resincronizar(app: &AppHandle) {
    solo_mostrar_ventana(app);

    if let Err(error) = app.emit("bandeja-ventana-restaurada", ()) {
        eprintln!("⚠️ Bandeja: no se pudo notificar la restauración de ventana: {error}");
    }
}
