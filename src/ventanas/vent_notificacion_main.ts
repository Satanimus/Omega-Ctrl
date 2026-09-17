// ======================================================
// 🔔 vent_Notificacion_Main
// ------------------------------------------------------
// Punto de entrada de la ventana overlay Notificación
// (notificacion.html — página independiente, ver
// vite.config.ts). Misma familia visual que "Modo Captura"/
// Indicador_Macro (reusa styl_indicador_macro.css, sin CSS
// propio), pero sin botón Cancelar. Dos modos:
//
// Modo "real" (?modo=real&perfil=...&activado=true|false):
// se abre desde el atajo global Activar/Desactivar perfil (ver
// entrada.rs/back_notificacion.rs). No arrastrable, no roba
// foco (WS_EX_NOACTIVATE ya aplicado en el backend) — se
// autocierra sola pasado config::duracion_notificacion_ms.
//
// Modo "ubicar" (?modo=ubicar): se abre desde el botón
// "Ubicación" de la fila de Configuración → General. Sí
// arrastrable (mismo mecanismo manual que
// vent_indicador_macro_main.ts) — al arrastrarla persiste su
// propia posición ("Guardar" en Configuración solo cierra la
// ventana).
// ======================================================

import { invoke } from "@tauri-apps/api/core";
import {
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";

import { aplicarOverridesApariencia } from "../core/core_apariencia";

import "../styles/styl_variables.css";
import "../styles/styl_indicador_macro.css";

void aplicarOverridesApariencia();

type ModoNotificacion = "real" | "ubicar";

// ======================================================
// 🖱️ ARRASTRE MANUAL (solo modo "ubicar")
// ------------------------------------------------------
// Mismo patrón que vent_indicador_macro_main.ts/
// vent_captura_main.ts (issue Tauri/Tao #10767: el arrastre
// nativo no es confiable en Windows para estas ventanas
// overlay) — reposiciona la ventana vía obtener_cursor_captura
// (GetCursorPos) en cada mousemove.
// ======================================================

function activarArrastre(raiz: HTMLElement): void {
  const ventana = getCurrentWindow();

  let arrastrando = false;
  let offsetX = 0;
  let offsetY = 0;

  const alMover = async (): Promise<void> => {
    if (!arrastrando) return;

    let cursor: [number, number];

    try {
      cursor = await invoke<[number, number]>("obtener_cursor_captura");
    } catch {
      return;
    }

    if (!arrastrando) return; // pudo soltarse mientras el invoke estaba en vuelo.

    const [cursorX, cursorY] = cursor;

    void ventana.setPosition(
      new PhysicalPosition(cursorX - offsetX, cursorY - offsetY),
    );
  };

  const alSoltar = (): void => {
    arrastrando = false;

    document.removeEventListener("mousemove", alMover);
    document.removeEventListener("mouseup", alSoltar);

    void guardarPosicionTrasArrastre(ventana);
  };

  raiz.addEventListener("mousedown", (evento) => {
    if (evento.button !== 0) return;

    void (async () => {
      const [posicion, cursor] = await Promise.all([
        ventana.outerPosition(),
        invoke<[number, number]>("obtener_cursor_captura"),
      ]);

      offsetX = cursor[0] - posicion.x;
      offsetY = cursor[1] - posicion.y;
      arrastrando = true;

      document.addEventListener("mousemove", alMover);
      document.addEventListener("mouseup", alSoltar);
    })();
  });
}

// Persiste la posición actual (coordenadas lógicas, mismo criterio
// que vent_indicador_macro_main.ts) en la clave propia de
// Notificación (guardar_posicion_notificacion).
async function guardarPosicionTrasArrastre(
  ventana: ReturnType<typeof getCurrentWindow>,
): Promise<void> {
  try {
    const [posicion, escala] = await Promise.all([
      ventana.outerPosition(),
      ventana.scaleFactor(),
    ]);

    await invoke("guardar_posicion_notificacion", {
      x: posicion.x / escala,
      y: posicion.y / escala,
    });
  } catch (error) {
    console.error(
      "❌ No se pudo guardar la posición de la notificación:",
      error,
    );
  }
}

// ======================================================
// 📏 ALTO AL CONTENIDO, ANCHO FIJO
// ------------------------------------------------------
// A diferencia de vent_indicador_macro_main.ts, acá el ANCHO
// NO se mide del contenido: con texto variable entre modos
// ("Arrastrame" en modo ubicar vs. el nombre del perfil en modo
// real) la card quedaba con un ancho distinto en cada uno. Se
// fija siempre a ANCHO_NOTIFICACION_LOGICO (debe coincidir con
// back_notificacion.rs::ANCHO_NOTIFICACION_LOGICO, ya el inicial
// del builder) — de paso evita el corte del borde derecho que
// dejaba el cálculo Math.ceil(rect.width)+2 en modo real. El
// alto sí se sigue midiendo (varía con fuente/skin de
// Apariencia).
// ======================================================

const ANCHO_NOTIFICACION_LOGICO = 200;

function ajustarAltoAlContenido(card: HTMLElement): void {
  card.style.height = "auto";

  void card.offsetHeight;

  const alto = Math.ceil(card.getBoundingClientRect().height) + 2;

  card.style.height = "";

  void getCurrentWindow()
    .setSize(new LogicalSize(ANCHO_NOTIFICACION_LOGICO, alto))
    .catch(() => {
      // Ventana en cierre — nada que hacer.
    });
}

// ======================================================
// 🏗️ ARMAR CARD (header + cuerpo, sin botón Cancelar)
// ------------------------------------------------------
// Misma estructura visual que Indicador_Macro/Modo Captura,
// reusando sus clases CSS — esta ventana no tiene botón
// Cancelar en el header.
// ======================================================

interface CardNotificacion {
  card: HTMLElement;
  punto: HTMLSpanElement;
  texto: HTMLSpanElement;
}

function crearCard(raiz: HTMLElement, titulo: string): CardNotificacion {
  const card = document.createElement("div");
  card.className = "indicador-macro-card";

  const header = document.createElement("div");
  header.className = "indicador-macro-header";

  const icono = document.createElement("span");
  icono.className = "indicador-macro-header-icono";
  icono.textContent = "⠿";

  const tituloSpan = document.createElement("span");
  tituloSpan.className = "indicador-macro-header-titulo";
  tituloSpan.textContent = titulo;

  header.append(icono, tituloSpan);

  const cuerpo = document.createElement("div");
  cuerpo.className = "indicador-macro-cuerpo";

  const punto = document.createElement("span");
  punto.className = "indicador-macro-punto";

  const texto = document.createElement("span");
  texto.className = "indicador-macro-texto";

  cuerpo.append(punto, texto);
  card.append(header, cuerpo);
  raiz.append(card);

  return { card, punto, texto };
}

// ======================================================
// 📍 MODO UBICAR
// ------------------------------------------------------
// Texto fijo "Arrastrame", punto verde fijo — a diferencia del
// modo "real", acá el header SÍ se activa para arrastre manual.
// ======================================================

function iniciarModoUbicar(raiz: HTMLElement): void {
  const { card, punto, texto } = crearCard(raiz, "Notificación");

  punto.dataset.estado = "play";
  texto.textContent = "Arrastrame";

  activarArrastre(card.querySelector(".indicador-macro-header") as HTMLElement);

  ajustarAltoAlContenido(card);
}

// ======================================================
// 🟢🔴 MODO REAL
// ------------------------------------------------------
// Sin arrastre (no se llama a activarArrastre). Se autocierra
// pasado config::duracion_notificacion_ms (obtenido_duracion_
// notificacion_ms) — si ese comando falla, cae en el default de
// 2000ms para no dejar la ventana abierta para siempre.
// ======================================================

const DURACION_POR_DEFECTO_MS = 2000;

async function iniciarModoReal(
  raiz: HTMLElement,
  nombrePerfil: string,
  activado: boolean,
): Promise<void> {
  const { card, punto, texto } = crearCard(
    raiz,
    `Omega Ctrl - "${nombrePerfil}"`,
  );

  punto.dataset.estado = activado ? "play" : "activa";
  texto.textContent = activado ? "Perfil Activado" : "Perfil Desactivado";

  ajustarAltoAlContenido(card);

  let duracionMs = DURACION_POR_DEFECTO_MS;

  try {
    duracionMs = await invoke<number>("obtener_duracion_notificacion_ms");
  } catch (error) {
    console.error(
      "❌ No se pudo obtener la duración de la notificación, se usa el default:",
      error,
    );
  }

  setTimeout(() => {
    invoke("cerrar_ventana_notificacion").catch(() => {
      // Ventana ya cerrada — nada que hacer.
    });
  }, duracionMs);
}

function iniciar(): void {
  const raiz = document.getElementById("notificacion");
  if (!raiz) return;

  const parametros = new URLSearchParams(window.location.search);
  const modo = (parametros.get("modo") ?? "real") as ModoNotificacion;

  if (modo === "ubicar") {
    iniciarModoUbicar(raiz);
    return;
  }

  const nombrePerfil = parametros.get("perfil") ?? "";
  const activado = parametros.get("activado") === "true";

  void iniciarModoReal(raiz, nombrePerfil, activado);
}

iniciar();
