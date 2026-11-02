// Descargas: Excel plano (.xlsx) y PDF con el logo de Tope de Pizza
let logoCache = null;

// precarga librerías y logo para que el botón responda al toque (Safari necesita rapidez para compartir)
export function precargarDescargas() {
  import('xlsx').catch(() => {});
  import('jspdf').catch(() => {});
  import('jspdf-autotable').catch(() => {});
  cargarLogo().catch(() => {});
}

async function cargarLogo() {
  if (logoCache) return logoCache;
  const r = await fetch('/logo-chico.png');
  const blob = await r.blob();
  logoCache = await new Promise((ok, mal) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);
    fr.onerror = mal;
    fr.readAsDataURL(blob);
  });
  return logoCache;
}

// En el iPhone abre "Compartir" (guardar en Archivos, mandar por WhatsApp…); si no, descarga normal
export async function guardarArchivo(blob, nombre) {
  try {
    const file = new File([blob], nombre, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: nombre });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return; // canceló el compartir
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// hojas: [{ nombre, filas: [{ columna: valor, ... }] }]  -> tabla plana para trabajar
export async function descargarExcel(nombreArchivo, hojas) {
  const XLSX = await import('xlsx');
  const libro = XLSX.utils.book_new();
  hojas.forEach((h) => {
    // nunca mandar NaN / undefined a Excel
    h.filas = h.filas.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'number' && !isFinite(v) ? 0 : v ?? ''])));
    const hoja = XLSX.utils.json_to_sheet(h.filas.length ? h.filas : [{ '': 'Sin datos' }]);
    const cols = Object.keys(h.filas[0] || { '': '' });
    hoja['!cols'] = cols.map((c) => ({ wch: Math.min(Math.max(c.length, ...h.filas.map((f) => String(f[c] ?? '').length)) + 2, 50) }));
    XLSX.utils.book_append_sheet(libro, hoja, h.nombre.slice(0, 31));
  });
  const datos = XLSX.write(libro, { bookType: 'xlsx', type: 'array' });
  await guardarArchivo(new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivo);
}

const ROJO = [226, 38, 28];
const TEXTO = [43, 27, 18];
const SUAVE = [138, 116, 102];

// PDF: { archivo, titulo, subtitulo, kpis: [[etiqueta, valor]], bloques: [{ titulo, columnas, filas, pie, alinearDerecha: [índices] }] }
export async function descargarPDF({ archivo, titulo, subtitulo, kpis = [], bloques = [] }) {
  const [{ jsPDF }, autoTableMod, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), cargarLogo().catch(() => null)]);
  const autoTable = autoTableMod.default || autoTableMod.autoTable;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;

  // encabezado
  if (logo) doc.addImage(logo, 'PNG', M, 10, 24, 24);
  doc.setTextColor(...ROJO); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('Tope de Pizza', M + 30, 19);
  doc.setTextColor(...TEXTO); doc.setFontSize(13);
  doc.text(titulo, M + 30, 26);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...SUAVE);
  if (subtitulo) doc.text(doc.splitTextToSize(subtitulo, W - M * 2 - 30), M + 30, 31);
  doc.setDrawColor(...ROJO); doc.setLineWidth(0.6); doc.line(M, 38, W - M, 38);
  let y = 44;

  // tarjetas de totales
  if (kpis.length) {
    const porFila = Math.min(kpis.length, 4);
    const ancho = (W - M * 2 - (porFila - 1) * 4) / porFila;
    kpis.forEach(([etq, val], i) => {
      const col = i % porFila, fila = Math.floor(i / porFila);
      const x = M + col * (ancho + 4), yy = y + fila * 20;
      doc.setFillColor(251, 243, 234); doc.roundedRect(x, yy, ancho, 16, 2, 2, 'F');
      doc.setFontSize(8.5); doc.setTextColor(...SUAVE); doc.text(String(etq), x + 3, yy + 5.5);
      doc.setFontSize(12.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXTO); doc.text(String(val), x + 3, yy + 12.5);
      doc.setFont('helvetica', 'normal');
    });
    y += Math.ceil(kpis.length / porFila) * 20 + 2;
  }

  bloques.forEach((b) => {
    if (y > 260) { doc.addPage(); y = 16; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...TEXTO);
    doc.text(b.titulo, M, y + 4);
    autoTable(doc, {
      startY: y + 7,
      head: [b.columnas],
      body: b.filas.length ? b.filas : [[{ content: 'Sin datos', colSpan: b.columnas.length, styles: { halign: 'center', textColor: SUAVE } }]],
      foot: b.pie ? [b.pie] : undefined,
      margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: 1.8, textColor: TEXTO, lineColor: [239, 226, 211], lineWidth: 0.1 },
      headStyles: { fillColor: ROJO, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [251, 243, 234], textColor: TEXTO, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [253, 250, 246] },
      columnStyles: Object.fromEntries((b.alinearDerecha || []).map((i) => [i, { halign: 'right' }])),
      showFoot: 'lastPage',
    });
    y = doc.lastAutoTable.finalY + 9;
  });

  // pie de página
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(...SUAVE);
    doc.text(`Generado ${new Date().toLocaleString('es-AR')} · Página ${i} de ${n}`, M, doc.internal.pageSize.getHeight() - 8);
  }
  await guardarArchivo(doc.output('blob'), archivo);
}
