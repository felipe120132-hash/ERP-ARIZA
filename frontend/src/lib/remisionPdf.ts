import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { DocumentoRemision } from "@/services/documentoRemisionService";
import { formatCOP } from "./cartera";
export function generarRemisionPdf(data: DocumentoRemision) {
  const { remision: r, cliente: c, lines, names } = data;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({
    title: `Remisión ${r.consecutivo}`,
    author: "Distribuciones Ariza",
    subject: "Remisión comercial",
  });
  const margin = 15;
  doc.setFillColor(235, 241, 248);
  doc.rect(0, 0, 210, 43, "F");
  doc.setTextColor(25, 44, 65);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("DISTRIBUCIONES ARIZA", margin, 19);
  doc.setFontSize(11);
  doc.text(`REMISIÓN #${r.consecutivo}`, 195, 19, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Documento comercial - No es factura electrónica", margin, 28);
  doc.setTextColor(
    r.estado === "ANULADA" ? 170 : 70,
    r.estado === "ANULADA" ? 35 : 85,
    r.estado === "ANULADA" ? 35 : 100,
  );
  doc.text(`Estado: ${r.estado}`, 195, 29, { align: "right" });
  autoTable(doc, {
    startY: 49,
    margin: { left: 15, right: 15 },
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2,
      textColor: [38, 54, 71],
      overflow: "linebreak",
    },
    columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 60 } },
    body: [
      [
        {
          content: `CLIENTE\n${c?.nombre_tienda ?? r.cliente_id}`,
          styles: { fontStyle: "bold" },
        },
        `Fecha: ${r.fecha.toLocaleString("es-CO", { timeZone: "America/Bogota" })}\nHora de Colombia`,
      ],
      [
        `Contacto: ${c?.contacto ?? "No registrado"}\nTeléfono: ${c?.telefono ?? "No registrado"}\nDirección: ${c?.direccion ?? "No registrada"}`,
        `Pago: ${r.tipo_pago === "CREDITO" ? "Crédito" : "Contado"}\nIVA: ${r.aplica_iva ? "Aplicado por producto" : "No aplicado"}`,
      ],
    ],
  });
  let y =
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 7;
  autoTable(doc, {
    startY: y,
    margin: { top: 18, bottom: 24, left: 15, right: 15 },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 3,
      lineColor: [226, 232, 239],
      lineWidth: 0.15,
      overflow: "linebreak",
    },
    headStyles: { fillColor: [34, 63, 92], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 15, halign: "right" },
      2: { cellWidth: 29, halign: "right" },
      3: { cellWidth: 29, halign: "right" },
      4: { cellWidth: 20, halign: "right" },
      5: { cellWidth: 29, halign: "right" },
    },
    head: [["Producto", "Cant.", "Precio unit.", "Subtotal", "IVA %", "IVA"]],
    body: lines.map((l) => [
      names[l.producto_id] ?? `Producto ID: ${l.producto_id}`,
      l.cantidad.toLocaleString("es-CO"),
      formatCOP(l.precio_unitario),
      formatCOP(l.subtotal_linea),
      `${l.tasa_iva_aplicada}%`,
      formatCOP(l.iva_linea),
    ]),
    rowPageBreak: "avoid",
  });
  y =
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 9;
  if (y > 220) {
    doc.addPage();
    y = 22;
  }
  autoTable(doc, {
    startY: y,
    margin: { left: 116, right: 15, bottom: 24 },
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 1: { halign: "right" } },
    body: [
      ["Subtotal", formatCOP(r.subtotal)],
      ["IVA", formatCOP(r.iva)],
      [
        {
          content: "TOTAL COP",
          styles: { fontStyle: "bold", fillColor: [235, 241, 248] },
        },
        {
          content: formatCOP(r.total),
          styles: { fontStyle: "bold", fillColor: [235, 241, 248] },
        },
      ],
    ],
  });
  y =
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 9;
  doc.setTextColor(90, 105, 120);
  doc.setFontSize(8);
  const notes = [
    ...(r.estado === "ANULADA"
      ? ["REMISIÓN ANULADA. Documento conservado únicamente para consulta."]
      : []),
    "Importes originales del sistema. Este documento no acredita pago ni saldo pendiente.",
    "Datos descriptivos del cliente y productos consultados al generar el documento.",
    ...(data.incompleteNames
      ? [
          "Algunos datos descriptivos no están disponibles; se muestran sus identificadores.",
        ]
      : []),
  ];
  for (const note of notes) {
    const split = doc.splitTextToSize(note, 180);
    if (y + split.length * 4 > 271) {
      doc.addPage();
      y = 22;
    }
    doc.text(split, 15, y);
    y += split.length * 4 + 2;
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(220, 228, 237);
    doc.line(15, 278, 195, 278);
    doc.setFontSize(7);
    doc.setTextColor(100, 112, 125);
    doc.text(
      `Remisión #${r.consecutivo} | ${r.estado} | Página ${p} de ${pages}`,
      15,
      284,
    );
    doc.text(
      `Generado: ${data.generatedAt.toLocaleString("es-CO", { timeZone: "America/Bogota" })}`,
      195,
      284,
      { align: "right" },
    );
    doc.text(r.id, 15, 289);
  }
  return doc;
}
