const ICON_PATHS: Record<string, string> = {
  book: '<path d="M4 4h16v16H4z"/><path d="M4 9h16"/><path d="M9 4v5"/>',
  doc: '<path d="M6 2h9l3 3v17H6z"/><path d="M15 2v3h3"/><path d="M9 12h6"/><path d="M9 16h6"/>',
  parcel:
    '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 8v9l9 5 9-5V8"/><path d="M12 13v9"/>',
  bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>',
  truck:
    '<path d="M3 6h11v9H3z"/><path d="M14 10h4l3 3v2h-7z"/><circle cx="7.5" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/>',
  language: '<path d="M4 5h16v14H4z"/><path d="M4 9h16"/>',
  mic: '<path d="M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3z"/><path d="M5 11a7 7 0 0014 0"/><path d="M12 18v3"/>',
  send: '<path d="M4 12h16"/><path d="M14 6l6 6-6 6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>',
  check: '<path d="M5 13l4 4 10-10"/>',
  keyboard:
    '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>',
  volumeMuted:
    '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M23 9l-6 6"/><path d="M17 9l6 6"/>',
};

export function Icon({
  name,
  className,
}: {
  name: keyof typeof ICON_PATHS;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
