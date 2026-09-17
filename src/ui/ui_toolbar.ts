// ======================================================
// ui_Toolbar
// ======================================================
//
// Estados del perfil:
//
// Perfil Activo
//     → ui = json = caché
//
// Perfil inactivo
//     → ui = json, caché vacía
//
// Perfil editado
//     → ui ≠ json
//     → la caché mantiene su estado anterior
//
// ======================================================

import { invoke } from "@tauri-apps/api/core";

import { listen } from "@tauri-apps/api/event";

import logoUrl from "../assets/logo.svg";

import { alternarPanelLateral } from "../componentes/comp_panel_lateral";

import { alternarPanelAyuda } from "../componentes/comp_panel_ayuda";

import type {
  EstadoPerfilActual,
  ResultadoPerfil,
} from "../componentes/comp_panel_lateral";

import { convertirperfil_json } from "../core/core_perfil_json";

import { establecerPerfilUi, obtenerPerfilUi } from "../core/core_perfil_ui";

import {
  establecerAdvertenciasCompilacion,
  type ResultadoCompilacion,
} from "../core/core_advertencias_compilacion";

import { reconstruirTabla, salirModoMoverTabla } from "./ui_tabla_control";

import { crearFila as crearFilaPerfil } from "../core/core_perfil";

import { agregarSeparadores } from "../core/core_perfil_acciones";

import { esSeparador } from "../core/core_separadores";

// ======================================================
// 🔄 REFRESCAR ESTADO DESDE BACKEND (cambio de modo motor)
// ------------------------------------------------------
// motor::solicitar_cambio_modo ya detiene el perfil y limpia la
// caché en el backend (ver motor.rs) — esto solo relee ese estado
// y lo refleja en la toolbar. Usado por ui_layout.ts cuando el
// polling de ui_statusbar.ts detecta que el modo motor cambió
// (posiblemente desde la Ventana de Configuración).
// ======================================================

const nombresPorToolbar = new WeakMap<HTMLElement, HTMLElement>();

// ======================================================
// 🎚️ TOOLTIP ATAJO GLOBAL (perfil-estado)
// ------------------------------------------------------
// "Atajo global: Ctrl+F1" — se arma con el atajo guardado
// (obtener_tecla_toggle_perfil), nunca un texto fijo, para que
// si el usuario lo cambia en Configuración el tooltip lo
// refleje. Se consulta al crear la toolbar y de nuevo cada vez
// que la ventana recupera foco (por si se editó desde la
// ventana de Configuración mientras tanto).
// ======================================================

interface EntradaAtajoUI {
  nombre: string;
}

interface AtajoTogglePerfilUI {
  modificadores: EntradaAtajoUI[];

  gatillo: EntradaAtajoUI;
}

async function actualizarTooltipAtajoToggle(
  toolbar: HTMLElement,
): Promise<void> {
  const botonEstado = toolbar.querySelector(
    ".perfil-estado",
  ) as HTMLButtonElement | null;

  if (!botonEstado) {
    return;
  }

  try {
    const atajo = await invoke<AtajoTogglePerfilUI>(
      "obtener_tecla_toggle_perfil",
    );

    const nombres = [
      ...atajo.modificadores.map((entrada) => entrada.nombre),
      atajo.gatillo.nombre,
    ];

    botonEstado.title = `Atajo global: ${nombres.join("+")}`;
  } catch (error) {
    console.error("❌ No se pudo obtener el atajo global del perfil:", error);
  }
}

// ======================================================
// 🎚️ ESTADO PERFIL (atajo global toggle)
// ------------------------------------------------------
// El atajo global Activar/Desactivar (ver entrada.rs) puede cambiar
// el estado del perfil sin pasar por el botón de esta toolbar, así
// que se escucha el evento "cache_estado_cambio" (emitido desde
// cache.rs en escribir_cache/borrar_cache) para que el botón no
// quede desincronizado.
// ======================================================

export async function refrescarEstadoDesdeBackend(
  toolbar: HTMLElement,
): Promise<void> {
  try {
    const activo = await invoke<boolean>("obtener_estado_cache");

    marcarPerfilSegunCache(toolbar, activo);
  } catch (error) {
    console.error("❌ No se pudo refrescar el estado del perfil:", error);
  }
}

// ======================================================
// CREAR TOOLBAR
// ======================================================

export function crearToolbar(alGuardar: () => Promise<void>): HTMLElement {
  const toolbar = document.createElement("header");

  toolbar.className = "toolbar";

  toolbar.innerHTML = `

        <div class="toolbar-left">

            <button
                class="btn-menu-lateral"
                type="button"
                title="Menú"
                data-ayuda-id="btn-menu-lateral"
            >
                <img src="${logoUrl}" alt="Menú" />
            </button>

            <button
                class="btn-agregar-fila"
                type="button"
                title="Agregar fila"
                data-ayuda-id="btn-agregar-fila"
            >
                <span>+ Fila</span>
            </button>

            <button
                class="btn-agregar-separador"
                type="button"
                title="Agregar separador"
                data-ayuda-id="btn-agregar-separador"
            >
                <span>+ Separador</span>
            </button>

        </div>

        <div class="toolbar-center">

            <div class="perfil-box">

                <button
                    class="perfil-estado"
                    type="button"
                    data-ayuda-id="perfil-estado"
                >
                    <span class="perfil-estado-circulo"></span>
                    <span class="perfil-estado-textos"></span>
                </button>

            </div>

        </div>

        <div class="toolbar-right">

            <div class="cambios-pendientes">

                <span class="cambios-pendientes-texto">Cambios en perfil:</span>

                <button
                    class="btn-revertir-cambios"
                    type="button"
                    data-ayuda-id="btn-revertir-cambios"
                >
                    Revertir
                </button>

                <button
                    class="btn-guardar-cambios familia-highdark"
                    type="button"
                    data-ayuda-id="btn-guardar-cambios"
                >
                    Guardar
                </button>

            </div>

            <button
                class="btn-ayuda"
                type="button"
                title="Ayuda"
                data-ayuda-id="boton_panel_ayuda"
            >
                <span>❔</span>
            </button>

        </div>

    `;

  // ==================================================
  // 📄 NOMBRE PERFIL + TEXTO ESTADO
  // ==================================================

  const nombrePerfil = document.createElement("span");

  nombrePerfil.className = "perfil-selector-nombre";

  nombresPorToolbar.set(toolbar, nombrePerfil);

  const textoEstado = document.createElement("span");

  textoEstado.className = "perfil-estado-texto";

  const contenedorTextosEstado = toolbar.querySelector(
    ".perfil-estado-textos",
  ) as HTMLElement | null;

  contenedorTextosEstado?.append(nombrePerfil, textoEstado);

  actualizarTooltipAtajoToggle(toolbar);

  window.addEventListener("focus", () => {
    actualizarTooltipAtajoToggle(toolbar);
  });

  // ==================================================
  // 📄 PERFIL ACTUAL
  // ==================================================

  invoke<string>("obtener_nombre_perfil_actual")
    .then((nombre) => {
      nombrePerfil.textContent = nombre;
    })
    .catch((error) => {
      console.error("❌ No se pudo obtener el perfil actual:", error);
    });

  // ==================================================
  // 🟢🔴 ESTADO CACHE INICIAL
  // ==================================================

  invoke<boolean>("obtener_estado_cache")
    .then((activo) => {
      marcarPerfilSegunCache(toolbar, activo);
    })
    .catch((error) => {
      console.error("❌ No se pudo obtener el estado de la caché:", error);
    });

  // ==================================================
  // 🟢🔴 ESTADO PERFIL
  // ==================================================

  const botonEstado = toolbar.querySelector(
    ".perfil-estado",
  ) as HTMLButtonElement | null;

  botonEstado?.addEventListener("click", async () => {
    const estadoActual = botonEstado.dataset.estado;

    botonEstado.disabled = true;

    try {
      if (estadoActual === "activo") {
        await invoke("desactivar_perfil");

        marcarPerfilSegunCache(toolbar, false);
      } else if (estadoActual === "inactivo") {
        const resultado = await invoke<ResultadoCompilacion>("activar_perfil");

        establecerAdvertenciasCompilacion(resultado.advertencias);

        reconstruirTabla();

        marcarPerfilSegunCache(toolbar, resultado.activo);
      }
    } catch (error) {
      console.error(
        "❌ No se pudo cambiar el estado del perfil:",

        error,
      );

      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      botonEstado.disabled = false;
    }
  });

  void refrescarEstadoDesdeBackend(toolbar);

  void listen<boolean>("cache_estado_cambio", (evento) => {
    marcarPerfilSegunCache(toolbar, evento.payload);
  });

  // ==================================================
  // 💾 GUARDAR / ↩️ REVERTIR CAMBIOS PENDIENTES
  // ==================================================

  const botonGuardarCambios = toolbar.querySelector(
    ".btn-guardar-cambios",
  ) as HTMLButtonElement | null;

  botonGuardarCambios?.addEventListener("click", async () => {
    botonGuardarCambios.disabled = true;

    try {
      await alGuardar();

      salirModoMoverTabla();

      reconstruirTabla();

      const activo = await invoke<boolean>("obtener_estado_cache");

      marcarPerfilSegunCache(toolbar, activo);

      toolbar.querySelector(".cambios-pendientes")?.classList.remove("visible");
    } catch (error) {
      console.error("❌ No se pudo guardar el perfil:", error);

      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      botonGuardarCambios.disabled = false;
    }
  });

  const botonRevertirCambios = toolbar.querySelector(
    ".btn-revertir-cambios",
  ) as HTMLButtonElement | null;

  botonRevertirCambios?.addEventListener("click", async () => {
    botonRevertirCambios.disabled = true;

    try {
      const resultado = await invoke<ResultadoPerfil>(
        "restaurar_perfil_actual",
      );

      await aplicarResultadoPerfilEnToolbar(toolbar, resultado);
    } catch (error) {
      console.error("❌ No se pudieron revertir los cambios:", error);

      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      botonRevertirCambios.disabled = false;
    }
  });

  // ==================================================
  // ☰ MENÚ LATERAL
  // ==================================================

  const botonMenuLateral = toolbar.querySelector(
    ".btn-menu-lateral",
  ) as HTMLButtonElement | null;

  botonMenuLateral?.addEventListener("click", () => {
    alternarPanelLateral();
  });

  // ==================================================
  // ❔ AYUDA
  // ==================================================

  const botonAyuda = toolbar.querySelector(
    ".btn-ayuda",
  ) as HTMLButtonElement | null;

  botonAyuda?.addEventListener("click", () => {
    alternarPanelAyuda();
  });

  // ==================================================
  // ➕ AGREGAR FILA
  // ==================================================

  const botonAgregarFila = toolbar.querySelector(
    ".btn-agregar-fila",
  ) as HTMLButtonElement | null;

  botonAgregarFila?.addEventListener("click", () => {
    const perfil = obtenerPerfilUi();

    // [FIX] La fila nueva se agrega al final del array, así que
    // pertenece al último separador (si hay uno). Si ese separador
    // está contraído, la fila nace oculta y parece que el botón no
    // hizo nada — se expande acá antes de agregarla.
    let ultimoSeparador = null;

    for (let i = perfil.filas.length - 1; i >= 0; i--) {
      const item = perfil.filas[i];

      if (esSeparador(item)) {
        ultimoSeparador = item;

        break;
      }
    }

    if (ultimoSeparador && !ultimoSeparador.expandido) {
      ultimoSeparador.expandido = true;
    }

    perfil.filas.push(crearFilaPerfil());

    marcarPerfilEditado(toolbar);
    reconstruirTabla();
  });

  const botonAgregarSeparador = toolbar.querySelector(
    ".btn-agregar-separador",
  ) as HTMLButtonElement | null;

  botonAgregarSeparador?.addEventListener("click", () => {
    agregarSeparadores();

    marcarPerfilEditado(toolbar);
    reconstruirTabla();
  });

  return toolbar;
}

// ======================================================
// MARCAR PERFIL SEGÚN CACHE
// ======================================================

function marcarPerfilSegunCache(toolbar: HTMLElement, activo: boolean): void {
  if (activo) {
    marcarPerfilActivo(toolbar);
  } else {
    marcarPerfilInactivo(toolbar);
  }
}

// ======================================================
// ✏️ PERFIL EDITADO
// ======================================================

export function marcarPerfilEditado(toolbar: HTMLElement): void {
  toolbar.querySelector(".cambios-pendientes")?.classList.add("visible");
}

// ======================================================
// PERFIL ACTIVO
// ======================================================

export function marcarPerfilActivo(toolbar: HTMLElement): void {
  const botonEstado = toolbar.querySelector(
    ".perfil-estado",
  ) as HTMLButtonElement | null;

  const textoEstado = botonEstado?.querySelector(".perfil-estado-texto");

  if (!botonEstado || !textoEstado) {
    return;
  }

  textoEstado.textContent = "Perfil Activo";

  botonEstado.dataset.estado = "activo";
}

// ======================================================
// PERFIL INACTIVO
// ======================================================

export function marcarPerfilInactivo(toolbar: HTMLElement): void {
  const botonEstado = toolbar.querySelector(
    ".perfil-estado",
  ) as HTMLButtonElement | null;

  const textoEstado = botonEstado?.querySelector(".perfil-estado-texto");

  if (!botonEstado || !textoEstado) {
    return;
  }

  textoEstado.textContent = "Perfil inactivo";

  botonEstado.dataset.estado = "inactivo";
}

// ======================================================
// 📋 ESTADO ACTUAL DEL PERFIL (consumido por el panel lateral)
// ======================================================

export function obtenerEstadoPerfilActual(
  toolbar: HTMLElement,
): EstadoPerfilActual {
  const nombrePerfil = nombresPorToolbar.get(toolbar);

  return {
    nombreActual: nombrePerfil?.textContent ?? "",

    estaEditado:
      toolbar
        .querySelector(".cambios-pendientes")
        ?.classList.contains("visible") ?? false,
  };
}

// ======================================================
// 🔁 APLICAR RESULTADO PERFIL (llamado desde el panel lateral
// al cambiar/crear/clonar/renombrar/revertir un perfil)
// ------------------------------------------------------
// resultado.advertencias es null cuando la operación no recompiló
// (revertir cambios sin guardar, ver perfil.rs::
// restaurar_perfil_actual) — en ese caso se dejan las advertencias
// vigentes tal como están, sin pisarlas con una lista vacía.
// ======================================================

export async function aplicarResultadoPerfilEnToolbar(
  toolbar: HTMLElement,
  resultado: ResultadoPerfil,
): Promise<void> {
  const nombrePerfil = nombresPorToolbar.get(toolbar);

  const perfil = await convertirperfil_json(resultado.perfil);

  establecerPerfilUi(perfil);

  if (resultado.advertencias !== null) {
    establecerAdvertenciasCompilacion(resultado.advertencias);
  }

  reconstruirTabla();

  toolbar.querySelector(".cambios-pendientes")?.classList.remove("visible");

  if (nombrePerfil) {
    nombrePerfil.textContent = resultado.nombre;
  }

  marcarPerfilSegunCache(toolbar, resultado.cache_activo);
}
