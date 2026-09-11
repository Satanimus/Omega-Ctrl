// ======================================================
// 📏 util_texto_boton
// ------------------------------------------------------
// Quién llama: se auto-inicializa al importarse (main.ts y
// menu_express_main.ts la importan una vez cada uno).
// Qué hace: todo .ui-btn (y .cabecera-celda-texto, título de
// columna de la tabla) nace centrado (ver
// styl_botones.css/styl_tabla.css).
// Cuando su contenido de texto no entra en el ancho disponible,
// se le agrega la clase .ui-btn--desborda, que lo pasa a
// alineado a la izquierda — así overflow:hidden recorta solo el
// extremo derecho, nunca el izquierdo, y nunca con "...".
// Reglas: se revisa cada elemento existente al cargar, y con un
// MutationObserver + ResizeObserver se re-revisa cualquier
// elemento nuevo o que cambie de tamaño (la tabla se redibuja
// seguido, y sus columnas se redimensionan a mano).
// ======================================================

const CLASE_DESBORDA = "ui-btn--desborda";

const SELECTOR = ".ui-btn, .menu-express-boton, .cabecera-celda-texto";

function evaluarBoton(el: HTMLElement): void {
  el.classList.remove(CLASE_DESBORDA);

  if (el.scrollWidth > el.clientWidth) {
    el.classList.add(CLASE_DESBORDA);
  }
}

function evaluarTodos(raiz: ParentNode): void {
  raiz.querySelectorAll<HTMLElement>(SELECTOR).forEach(evaluarBoton);
}

const resizeObserver = new ResizeObserver((entradas) => {
  for (const entrada of entradas) {
    evaluarBoton(entrada.target as HTMLElement);
  }
});

const mutationObserver = new MutationObserver((mutaciones) => {
  for (const mutacion of mutaciones) {
    mutacion.addedNodes.forEach((nodo) => {
      if (!(nodo instanceof HTMLElement)) return;

      if (nodo.matches(SELECTOR)) {
        resizeObserver.observe(nodo);
        evaluarBoton(nodo);
      }

      nodo.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
        resizeObserver.observe(el);
        evaluarBoton(el);
      });
    });
  }
});

export function iniciarAjusteTextoBotones(): void {
  evaluarTodos(document);

  document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
    resizeObserver.observe(el);
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true });
}
