// ======================================================
// 🔔🪟 Back_Notificacion
// ------------------------------------------------------
// Ventana overlay de notificación de Activación/Desactivación
// de perfil (label propio "notificacion", separado de
// Indicador_Macro — pueden estar abiertas a la vez). Dos
// modos:
// • "real": se abre desde el atajo global toggle de perfil
//   (entrada.rs/perfil.rs), sin AppHandle disponible como
//   parámetro de comando — se resuelve vía AppHandle global
//   (mismo patrón que back_menu_express.rs/runt_macro.rs).
// • "ubicar": se abre desde el botón "Ubicación" de la fila
//   de Configuración → General, sí arrastrable en el
//   frontend.
//
// WS_EX_NOACTIVATE (desactivar_activacion, ya existente en
// back_menu_express.rs) se aplica en ambos modos: en "real"
// evita robar foco de la ventana/juego activo; en "ubicar" es
// lo que permite que el arrastre manual funcione (mismo bug ya
// documentado para Indicador_Macro/preview de coordenada).
// ======================================================

use std::sync::OnceLock;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const LABEL_VENTANA_NOTIFICACION: &str = "notificacion";
const MARGEN_NOTIFICACION_LOGICO: f64 = 16.0;
const ANCHO_NOTIFICACION_LOGICO: f64 = 200.0;
const ALTO_NOTIFICACION_LOGICO: f64 = 66.0;

// ======================================================
// 🌐 APPHANDLE GLOBAL
// ------------------------------------------------------
// Mismo patrón que back_menu_express::inicializar/app_handle:
// se fija una única vez, apenas Tauri termina de inicializar
// (lib.rs).
// ======================================================

static APP: OnceLock<AppHandle> = OnceLock::new();

pub fn inicializar(app: AppHandle) {
    let _ = APP.set(app);
}

fn app_handle() -> Option<&'static AppHandle> {
    APP.get()
}

/// Percent-encoding mínimo para query params de texto libre (mismo
/// criterio que codificar_query en comandos.rs, duplicado acá para
/// no depender de ese archivo — back_notificacion.rs es capa
/// inferior a comandos.rs).
fn codificar_query(texto: &str) -> String {
    let mut salida = String::with_capacity(texto.len());

    for byte in texto.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                salida.push(byte as char);
            }
            _ => salida.push_str(&format!("%{:02X}", byte)),
        }
    }

    salida
}

// ======================================================
// 🏗️ CREAR/REUTILIZAR VENTANA
// ------------------------------------------------------
// Si ya hay una instancia con el mismo label, no se cierra ni
// se reconstruye: se navega esa misma ventana a la nueva url
// (window.location.replace, vía eval). Al recargar,
// vent_notificacion_main.ts se vuelve a ejecutar desde cero, así
// que el texto queda actualizado y su timer (setTimeout) arranca
// de nuevo solo. Evita el bug de close()+poll: close() es
// asíncrono, así que el poll bloqueaba el hilo principal
// esperando una destrucción que nunca se procesaba (el propio
// hilo principal es el que la procesa), y build() terminaba
// fallando con "a webview with label already exists".
// ======================================================

fn abrir_ventana_notificacion_interno(app: &AppHandle, url: String) -> Result<(), String> {
    if let Some(existente) = app.get_webview_window(LABEL_VENTANA_NOTIFICACION) {
        return existente
            .eval(&format!("window.location.replace({:?})", url))
            .map_err(|error| error.to_string());
    }

    let monitor = app
        .primary_monitor()
        .ok()
        .flatten()
        .ok_or_else(|| "No se pudo determinar el monitor primario".to_string())?;

    let escala = monitor.scale_factor();
    let pos_monitor = monitor.position();

    // Última posición guardada (arrastre previo en modo "ubicar",
    // ver configuracion_usuario::leer_posicion_notificacion). Si no
    // hay ninguna (primera vez o valor corrupto), cae en la esquina
    // superior izquierda del monitor primario.
    let (posicion_x, posicion_y) = crate::configuracion_usuario::leer_posicion_notificacion()
        .ok()
        .flatten()
        .unwrap_or((
            pos_monitor.x as f64 / escala + MARGEN_NOTIFICACION_LOGICO,
            pos_monitor.y as f64 / escala + MARGEN_NOTIFICACION_LOGICO,
        ));

    let ventana_notificacion = WebviewWindowBuilder::new(
        app,
        LABEL_VENTANA_NOTIFICACION,
        WebviewUrl::App(url.into()),
    )
    .title("OmegaCtrl — Notificación")
    .inner_size(ANCHO_NOTIFICACION_LOGICO, ALTO_NOTIFICACION_LOGICO)
    .position(posicion_x, posicion_y)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .build()
    .map_err(|error| error.to_string())?;

    // Ver header del archivo: aplicado en ambos modos (real/ubicar).
    crate::back_menu_express::desactivar_activacion(&ventana_notificacion);

    Ok(())
}

// ======================================================
// 🔔 MODO "real"
// ------------------------------------------------------
// Llamado desde el atajo global toggle de perfil (sin AppHandle
// como parámetro de comando) — resuelve el AppHandle vía
// app_handle().
// ======================================================

// [Etapa G] Reemplazo en ráfaga: esta función se llama directo desde
// el hilo que lee el input físico (entrada.rs), no desde el hilo
// principal — igual que runt_macro::abrir_overlay_indicador_play,
// WebviewWindowBuilder::build()/WebviewWindow::eval() (dentro de
// abrir_ventana_notificacion_interno) exigen el hilo principal en
// Windows, así que hay que encolarla vía AppHandle::run_on_main_thread
// en vez de llamarla directo. run_on_main_thread devuelve de inmediato
// sin esperar a que la ventana termine de crearse/navegar, así que una
// ráfaga de toggles no bloquea el hilo de input: solo encola varias
// navegaciones seguidas en el hilo principal, cada una reemplazando el
// texto y reiniciando el timer de la anterior (ver comentario de
// abrir_ventana_notificacion_interno).
pub(crate) fn abrir_notificacion_real(nombre_perfil: String, activado: bool) -> Result<(), String> {
    let app = app_handle().ok_or_else(|| "AppHandle no inicializado".to_string())?;
    let app = app.clone();

    let url = format!(
        "notificacion.html?modo=real&perfil={}&activado={}",
        codificar_query(&nombre_perfil),
        activado
    );

    app.clone()
        .run_on_main_thread(move || {
            if let Err(error) = abrir_ventana_notificacion_interno(&app, url) {
                eprintln!("⚠️ No se pudo abrir la notificación de perfil: {}", error);
            }
        })
        .map_err(|error| error.to_string())
}

// ======================================================
// 📍 MODO "ubicar"
// ------------------------------------------------------
// Llamado desde el botón "Ubicación" de la fila de
// Configuración → General (sí recibe AppHandle, viene de un
// comando Tauri).
// ======================================================

pub(crate) fn abrir_notificacion_ubicacion(app: &AppHandle) -> Result<(), String> {
    abrir_ventana_notificacion_interno(app, "notificacion.html?modo=ubicar".to_string())
}

pub(crate) fn cerrar_ventana_notificacion(app: &AppHandle) {
    if let Some(ventana) = app.get_webview_window(LABEL_VENTANA_NOTIFICACION) {
        let _ = ventana.close();
    }
}

// ======================================================
// 🔔 NOTIFICAR ESTADO ACTUAL DEL PERFIL (helper compartido)
// ------------------------------------------------------
// Respeta config::mostrar_notificaciones() y resuelve el nombre del
// perfil actual (crate::usuario::nombre_actual()) antes de abrir la
// notificación real — mismo criterio ya usado por
// entrada.rs::notificar_toggle_perfil, ahora reutilizable también
// desde comandos.rs (cambio de perfil disparado desde la bandeja de
// sistema o desde la barra lateral de la ventana principal).
// ======================================================

pub(crate) fn notificar_estado_perfil(activado: bool) {
    notificar_estado_perfil_interno(activado, true);
}

// Variante para llamar desde un comando Tauri `async fn` (ej.
// comandos::seleccionar_perfil), que por serlo ya corre en contexto
// seguro para WebView2 (mismo motivo documentado en
// abrir_ventana_captura_coordenada): NO debe encolar con
// run_on_main_thread, se llama directo a
// abrir_ventana_notificacion_interno, igual que ya hace
// abrir_notificacion_ubicacion.
pub(crate) fn notificar_estado_perfil_directo(activado: bool) {
    notificar_estado_perfil_interno(activado, false);
}

fn notificar_estado_perfil_interno(activado: bool, encolar_en_hilo_principal: bool) {
    if !crate::config::mostrar_notificaciones() {
        return;
    }

    let nombre_perfil = match crate::usuario::nombre_actual() {
        Ok(nombre) => nombre,
        Err(error) => {
            eprintln!("⚠️ No se pudo determinar el nombre del perfil para la notificación: {error}");
            return;
        }
    };

    if encolar_en_hilo_principal {
        if let Err(error) = abrir_notificacion_real(nombre_perfil, activado) {
            eprintln!("⚠️ No se pudo abrir la notificación de perfil: {error}");
        }
        return;
    }

    let Some(app) = app_handle() else {
        eprintln!("⚠️ AppHandle no inicializado, no se pudo abrir la notificación de perfil");
        return;
    };

    let url = format!(
        "notificacion.html?modo=real&perfil={}&activado={}",
        codificar_query(&nombre_perfil),
        activado
    );

    if let Err(error) = abrir_ventana_notificacion_interno(app, url) {
        eprintln!("⚠️ No se pudo abrir la notificación de perfil: {error}");
    }
}
