import { QR_SIZE, qrCells } from "@/lib/kiosk-utils";

export function QRCode({ seed }: { seed: string }) {
  const cells = qrCells(seed);
  return (
    <div
      className="qr-grid"
      style={{ gridTemplateColumns: `repeat(${QR_SIZE}, 1fr)` }}
    >
      {cells.map((on, i) => (
        <div key={i} className={`qr-cell ${on ? "on" : ""}`} />
      ))}
    </div>
  );
}
