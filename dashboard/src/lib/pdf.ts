import { toJpeg } from "html-to-image";
import { jsPDF } from "jspdf";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the dashboard image."));
    image.src = src;
  });
}

export async function downloadRunPdf(node: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await toJpeg(node, {
    pixelRatio: 2,
    quality: 0.85,
    backgroundColor: "#f4f7fb",
    cacheBust: true,
  });
  const image = await loadImage(dataUrl);
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const renderWidth = pageWidth - margin * 2;
  const renderHeight = (image.height * renderWidth) / image.width;
  const pageContentHeight = pageHeight - margin * 2;
  const scale = image.width / renderWidth;
  const sliceHeightPx = Math.max(1, Math.floor(pageContentHeight * scale));
  const pageCount = Math.ceil(image.height / sliceHeightPx);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the PDF canvas.");

  for (let page = 0; page < pageCount; page += 1) {
    if (page > 0) pdf.addPage();
    const sourceY = page * sliceHeightPx;
    const drawHeight = Math.min(sliceHeightPx, image.height - sourceY);
    canvas.width = image.width;
    canvas.height = drawHeight;
    context.fillStyle = "#f4f7fb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, sourceY, image.width, drawHeight, 0, 0, image.width, drawHeight);
    pdf.addImage(
      canvas.toDataURL("image/jpeg", 0.85),
      "JPEG",
      margin,
      margin,
      renderWidth,
      drawHeight / scale,
    );
  }

  pdf.save(filename);
}
