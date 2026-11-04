const formats = ["PDF", "DOCX", "HTML", "Markdown", "JSON", "CSV"] as const;

export function ExportOptions() {
  return (
    <details className="export-options">
      <summary>Export this list</summary>
      <div className="export-options-panel">
        <p>Exports are not available yet. No file has been generated.</p>
        <ul aria-label="Planned export formats">
          {formats.map((format) => (
            <li key={format}>
              <button type="button" disabled aria-label={`${format} export not available`}>
                {format}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
