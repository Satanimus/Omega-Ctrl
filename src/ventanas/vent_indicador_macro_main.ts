// ======================================================
// 🟢🔴 vent_Indicador_Macro_Main
// ------------------------------------------------------
// Punto de entrada de la ventana overlay Indicador_Macro
// (indicador_macro.html — página independiente, ver
// vite.config.ts). Reemplaza a vent_grabacion_macro_main.ts:
// misma ventana/label, ahora con tres modos.
//
// Estilo tipo card (header + cuerpo), mismo criterio visual que
// "Modo Captura" (vent_captura_main.ts/styl_captura.css): ancho
// ajustado al contenido en vez de fijo, ver crearCard() más abajo.
//
// Modo "grabacion": el nombre de la tecla toggle llega una
// sola vez por query param (?modo=grabacion&tecla=...),
// fijado por comandos.rs al crear la ventana — eso no
// cambia en toda la vida de la ventana. El ESTADO (🟡 armada
// / 🔴 activa) sí cambia con la tecla física, así que esta
// ventana hace su propio polling corto sobre
// obtener_estado_grabacion_macro (mismo patrón que el
// editor, ver comp_popup_macro_editor.ts) para reflejarlo en
// vivo — no espera ningún invoke del editor.
//
// Modo "play" (?modo=play): punto verde fijo + contador
// "paso_actual / total_pasos". El progreso se consulta por
// polling corto sobre obtener_progreso_indicador_macro
// (runt_macro.rs).
//
// Modo "ubicar" (?modo=ubicar): texto fijo "Arrastrame", sin
// polling — se abre/cierra desde el popup Extra de Macro
// (comp_popup_macro_extra.ts) para reposicionar la ventana a mano
// cuando no hay una ejecución real en curso (en Play el mouse está
// en movimiento y no es viable arrastrarla ahí).
// ======================================================

import { invoke } from "@tauri-apps/api/core";
import {
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";

import { aplicarOverridesApariencia } from "../core/core_apariencia";
import type { EstadoGrabacionMacro } from "../core/core_grabacion_macro";

import "../styles/styl_variables.css";
import "../styles/styl_indicador_macro.css";

void aplicarOverridesApariencia();

// Alto de la ventana: al igual que el ancho, se mide del contenido
// real (no un valor fijo) — con header+cuerpo variando de alto
// entre skins/tamaños de fuente configurables (pestaña Apariencia),
// un alto fijo podía quedar corto y cortar el borde inferior de la
// card. ALTO_INDICADOR_MACRO_LOGICO en comandos.rs sigue existiendo
// solo como tamaño inicial antes de que haya contenido que medir.

type ModoIndicadorMacro = "grabacion" | "play" | "ubicar";

interface ProgresoIndicadorMacro {
  pasoActual: number;
  totalPasos: number;
}

function textoEstadoGrabacion(
  tecla: string,
  estado: EstadoGrabacionMacro,
): string {
  if (estado === "activa") {
    return `Presione ${tecla} para detener`;
  }

  return `Presione ${tecla} para grabar`;
}

function textoProgresoPlay(progreso: ProgresoIndicadorMacro): string {
  const pasoActual = String(progreso.pasoActual).padStart(2, "0");
  const totalPasos = String(progreso.totalPasos).padStart(2, "0");

  return `${pasoActual} / ${totalPasos}`;
}

// ======================================================
// 🖱️ ARRASTRE MANUAL
// ------------------------------------------------------
// NO se usa data-tauri-drag-region / startDragging() nativo: mismo
// bug de Tauri/Tao ya documentado en vent_captura_main.ts (issue
// #10767) — en Windows el arrastre nativo no es confiable para
// estas ventanas overlay.
//
// El intento anterior calculaba el delta con evento.screenX/screenY
// (coordenadas del evento del mouse dentro del webview) multiplicado
// por scaleFactor() — en Webview2/Windows esas coordenadas no
// siempre están en la misma base física que outerPosition(), lo que
// hacía que el arrastre no funcionara. Se cambia al mismo patrón que
// SÍ funciona en el marcador arrastrable de vent_captura_main.ts
// (activarArrastreMarcador): en cada mousemove se pide el cursor
// físico real vía el comando obtener_cursor_captura (mismo backend,
// GetCursorPos) y la ventana se reposiciona directo a esa coordenada
// menos el offset fijado al mousedown — sin depender de deltas de
// eventos del webview.
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

    // Última posición: se persiste al soltar.
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

// Persiste la posición actual de la ventana (Etapa C:
// guardar_posicion_indicador_macro) en coordenadas LÓGICAS — mismo
// sistema que usa comandos.rs al crear/posicionar la ventana
// (posicion_x/posicion_y ahí están divididas por scale_factor()).
// outerPosition() devuelve físicas, así que hay que escalar antes
// de guardar o la posición restaurada no coincidiría con la
// arrastrada.
async function guardarPosicionTrasArrastre(
  ventana: ReturnType<typeof getCurrentWindow>,
): Promise<void> {
  try {
    const [posicion, escala] = await Promise.all([
      ventana.outerPosition(),
      ventana.scaleFactor(),
    ]);

    await invoke("guardar_posicion_indicador_macro", {
      x: posicion.x / escala,
      y: posicion.y / escala,
    });
  } catch (error) {
    console.error("❌ No se pudo guardar la posición del indicador:", error);
  }
}

// ======================================================
// 📏 ANCHO AL CONTENIDO
// ------------------------------------------------------
// La ventana nace con un ancho fijo (comandos.rs, solo para el
// primer instante antes de que haya contenido que medir). Acá se
// ajusta al ancho real del contenido (header + cuerpo, el más ancho
// de los dos manda) cada vez que el texto cambia, para que
// "🟢 03 / 15" no quede tan ancho como "Presione Control Izquierdo +
// F1 para grabar" ni viceversa. card tiene width:100% por CSS
// (llena la ventana) — se fuerza a max-content un instante para
// medir su ancho natural y se revierte.
// ======================================================

// ======================================================
// 📏 TAMAÑO AL CONTENIDO (ancho + alto)
// ------------------------------------------------------
// La ventana nace con un tamaño fijo (comandos.rs, solo para el
// primer instante antes de que haya contenido que medir). Acá se
// ajusta al tamaño real del contenido (header + cuerpo) cada vez
// que el texto cambia, para que "🟢 03 / 15" no quede tan ancho
// como "Presione Control Izquierdo + F1 para grabar" ni viceversa,
// y para que el alto siga a header+cuerpo (fuente/skin de Apariencia
// pueden cambiar esa altura) sin cortar el borde de la card. card
// tiene width/height:100% por CSS (llena la ventana) — se fuerza a
// max-content/auto un instante para medir su tamaño natural y se
// revierte.
// ======================================================

function ajustarTamañoAlContenido(card: HTMLElement): void {
  card.style.width = "max-content";
  card.style.height = "auto";

  const rect = card.getBoundingClientRect();
  const ancho = Math.ceil(rect.width);
  const alto = Math.ceil(rect.height);

  card.style.width = "";
  card.style.height = "";

  void getCurrentWindow()
    .setSize(new LogicalSize(ancho, alto))
    .catch(() => {
      // Ventana en cierre — nada que hacer.
    });
}

// ======================================================
// 🏗️ ARMAR CARD (header + cuerpo)
// ------------------------------------------------------
// Mismo estilo que la ventana "Modo Captura" (vent_captura_main.ts):
// header con ícono de arrastre (⠿), título y botón Cancelar; debajo,
// el cuerpo con el punto de estado y el texto — ya existentes en
// los 3 modos. El header es la única zona de arrastre (antes lo era
// la ventana entera) para no competir con el click del botón
// Cancelar.
// ======================================================

interface CardIndicadorMacro {
  card: HTMLElement;
  punto: HTMLSpanElement;
  texto: HTMLSpanElement;
}

function crearCard(raiz: HTMLElement, titulo: string): CardIndicadorMacro {
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

  const botonCancelar = document.createElement("button");
  botonCancelar.className = "indicador-macro-cancelar";
  botonCancelar.textContent = "Cancelar";
  botonCancelar.addEventListener("click", () => void cancelar());

  header.append(icono, tituloSpan, botonCancelar);
  activarArrastre(header);

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

// Regla 7 (mismo criterio que vent_captura_main.ts): Esc cancela
// esta ventana, igual que el botón Cancelar del header.
document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape") void cancelar();
});

// Se fija en iniciar() según el modo — cada modo cancela distinto
// (ver iniciarModoGrabacion/Play/Ubicar).
let cancelar: () => void | Promise<void> = () => {
  void invoke("cerrar_ventana_indicador_macro").catch(() => {});
};

// ======================================================
// 🔴 MODO GRABACIÓN
// ------------------------------------------------------
// Cancelar acá replica cancelarArmado() del editor (ver
// comp_popup_macro_editor.ts): detiene la grabación armada/activa Y
// cierra esta ventana — el editor, con la grabación ya en
// "inactiva", no dispara su propio cierre para la transición
// armada→inactiva (solo lo hace para activa→inactiva, ver
// finalizarGrabacion), así que esta ventana debe cerrarse sola.
// ======================================================

function iniciarModoGrabacion(raiz: HTMLElement, tecla: string): void {
  const { card, punto, texto } = crearCard(raiz, "Grabador de Macro");

  punto.dataset.estado = "armada";
  texto.textContent = textoEstadoGrabacion(tecla, "armada");

  ajustarTamañoAlContenido(card);

  let estadoActual: EstadoGrabacionMacro = "armada";

  cancelar = () => {
    invoke("detener_grabacion_macro").catch((error) => {
      console.error("❌ No se pudo cancelar la grabación:", error);
    });

    invoke("cerrar_ventana_indicador_macro").catch((error) => {
      console.error("❌ No se pudo cerrar el indicador de grabación:", error);
    });
  };

  setInterval(() => {
    invoke<EstadoGrabacionMacro>("obtener_estado_grabacion_macro")
      .then((nuevoEstado) => {
        if (nuevoEstado === estadoActual || nuevoEstado === "inactiva") {
          // "inactiva" significa que la ventana ya está por cerrarse
          // (cerrar_ventana_indicador_macro, disparado desde el
          // editor al detectar Activa→Inactiva) — no vale la pena
          // repintar el instante previo al cierre.
          return;
        }

        estadoActual = nuevoEstado;
        punto.dataset.estado = nuevoEstado;
        texto.textContent = textoEstadoGrabacion(tecla, nuevoEstado);
        ajustarTamañoAlContenido(card);
      })
      .catch(() => {
        // Ventana huérfana/en cierre — nada que hacer.
      });
  }, 200);
}

// ======================================================
// 🟢 MODO PLAY
// ------------------------------------------------------
// El catch silencioso deja el contador sin actualizar ante un
// fallo — mismo criterio de tolerancia a fallos que el polling
// de modo Grabación. Cancelar acá solo cierra la ventana (no hay
// grabación que detener — la macro sigue ejecutándose igual, el
// indicador es solo visual).
// ======================================================

function iniciarModoPlay(raiz: HTMLElement): void {
  const { card, punto, texto } = crearCard(raiz, "Reproduciendo Macro");

  punto.dataset.estado = "play";
  texto.textContent = "00 / 00";

  ajustarTamañoAlContenido(card);

  setInterval(() => {
    invoke<ProgresoIndicadorMacro>("obtener_progreso_indicador_macro")
      .then((progreso) => {
        texto.textContent = textoProgresoPlay(progreso);
        ajustarTamañoAlContenido(card);
      })
      .catch(() => {
        // Ventana en cierre — nada que hacer.
      });
  }, 200);
}

// ======================================================
// 📍 MODO UBICAR
// ------------------------------------------------------
// Texto fijo, sin polling — el arrastre (ahora limitado al header)
// y el guardado de posición son los mismos de siempre
// (activarArrastre/guardarPosicionTrasArrastre). Cancelar solo
// cierra la ventana, igual que "Guardar" en el popup Extra de Macro.
// ======================================================

function iniciarModoUbicar(raiz: HTMLElement): void {
  const { card, punto, texto } = crearCard(raiz, "Ubicar Indicador");

  punto.dataset.estado = "play";
  texto.textContent = "Arrastrame";

  ajustarTamañoAlContenido(card);
}

function iniciar(): void {
  const raiz = document.getElementById("indicador-macro");
  if (!raiz) return;

  const parametros = new URLSearchParams(window.location.search);
  const modo = (parametros.get("modo") ?? "grabacion") as ModoIndicadorMacro;

  if (modo === "play") {
    iniciarModoPlay(raiz);
    return;
  }

  if (modo === "ubicar") {
    iniciarModoUbicar(raiz);
    return;
  }

  const tecla = parametros.get("tecla") ?? "";
  iniciarModoGrabacion(raiz, tecla);
}

iniciar();
