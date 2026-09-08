import Link from "next/link";

export default function NotFound() {
  return (
    <main className="qattan-not-found" lang="en" dir="ltr">
      <p className="qattan-eyebrow">Qattan AI</p>
      <h1>Page not found</h1>
      <p>
        Return to the architectural studio to explore the visualization and
        design tools.
      </p>
      <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
        <Link className="qattan-button qattan-button-primary" href="/en">
          Back to home
        </Link>
        <Link className="qattan-button qattan-button-secondary" href="/ar">
          الصفحة الرئيسية
        </Link>
      </div>
    </main>
  );
}
