// ======================================================
// ❔📍 comp_Panel_Ayuda_Coordenadas
// ------------------------------------------------------
// Panel de ayuda lateral derecho de la ventana "Gestor de
// Coordenadas guardadas". A diferencia de comp_panel_ayuda.ts
// (ventana principal), el contenido es fijo: no cambia con
// hover, se carga una sola vez desde ayuda.txt (id_objeto
// "ventana-coordenadas") y muestra todo de un saque.
// ======================================================

import { invoke } from "@tauri-apps/api/core";

import { renderizarAyuda } from "../util/util_texto_ayuda";

const ID_AYUDA_COORDENADAS = "ventana-coordenadas";

let panelElemento: HTMLElement | null = null;

export function crearPanelAyudaCoordenadas(): HTMLElement {
  const panel = document.createElement("div");

  panel.className = "panel-ayuda panel-ayuda-coordenadas";

  const cuerpoPanel = document.createElement("div");

  cuerpoPanel.className = "panel-ayuda-cuerpo";

  panel.append(cuerpoPanel);

  panelElemento = panel;

  invoke<string | null>("obtener_ayuda", { idObjeto: ID_AYUDA_COORDENADAS })
    .then((contenido) => {
      if (contenido) {
        cuerpoPanel.replaceChildren(renderizarAyuda(contenido));
      }
    })
    .catch((error) => {
      console.error(
        "❌ No se pudo obtener el contenido de ayuda de coordenadas:",
        error,
      );
    });

  return panel;
}

export function alternarPanelAyudaCoordenadas(): void {
  panelElemento?.classList.toggle("abierto");
}
