/** Inline SVG icons (ARCH §10.2): 24 px glyphs, currentColor, decorative (labels carry meaning). */
import type { JSX } from 'preact';

type P = { title?: string };

function svg(children: JSX.Element | JSX.Element[], title?: string) {
  return (
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconPlay = ({ title }: P) => svg(<path d="M7 5v14l11-7z" fill="currentColor" stroke="none" />, title);
export const IconPause = ({ title }: P) => svg([<rect x="6" y="5" width="4" height="14" fill="currentColor" stroke="none" />, <rect x="14" y="5" width="4" height="14" fill="currentColor" stroke="none" />], title);
export const IconStep = ({ title }: P) => svg([<path d="M6 5v14l9-7z" fill="currentColor" stroke="none" />, <rect x="16" y="5" width="3" height="14" fill="currentColor" stroke="none" />], title);
export const IconUndo = ({ title }: P) => svg([<path d="M9 14 4 9l5-5" />, <path d="M4 9h10a6 6 0 0 1 0 12h-3" />], title);
export const IconLife = ({ title }: P) => svg([<ellipse cx="12" cy="12" rx="8" ry="5" />, <path d="M9 12h6" />, <circle cx="12" cy="12" r="1" fill="currentColor" />], title);
export const IconFood = ({ title }: P) => svg([<circle cx="8" cy="14" r="2.5" />, <circle cx="15" cy="10" r="2.5" />, <circle cx="15.5" cy="17" r="1.8" />, <circle cx="9" cy="7" r="1.5" />], title);
export const IconLook = ({ title }: P) => svg([<circle cx="11" cy="11" r="6" />, <path d="m20 20-4.5-4.5" />], title);
export const IconMore = ({ title }: P) => svg([<circle cx="5" cy="12" r="1.5" fill="currentColor" />, <circle cx="12" cy="12" r="1.5" fill="currentColor" />, <circle cx="19" cy="12" r="1.5" fill="currentColor" />], title);
export const IconBack = ({ title }: P) => svg(<path d="m15 18-6-6 6-6" />, title);
export const IconClose = ({ title }: P) => svg([<path d="M6 6l12 12" />, <path d="M18 6 6 18" />], title);
export const IconZoomDish = ({ title }: P) => svg([<circle cx="12" cy="12" r="8" />, <circle cx="12" cy="12" r="3" />], title);
export const IconZoomIn = ({ title }: P) => svg([<circle cx="11" cy="11" r="6" />, <path d="M11 8v6M8 11h6" />, <path d="m20 20-4.5-4.5" />], title);
export const IconZoomOut = ({ title }: P) => svg([<circle cx="11" cy="11" r="6" />, <path d="M8 11h6" />, <path d="m20 20-4.5-4.5" />], title);
export const IconFollow = ({ title }: P) => svg([<circle cx="12" cy="12" r="3" />, <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />], title);
export const IconSave = ({ title }: P) => svg([<path d="M5 4h11l3 3v13H5z" />, <path d="M8 4v5h7V4" />, <rect x="8" y="13" width="8" height="5" />], title);
export const IconCopy = ({ title }: P) => svg([<rect x="8" y="8" width="12" height="12" rx="2" />, <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />], title);
export const IconGuide = ({ title }: P) => svg([<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />, <path d="M4 19V5" />], title);
export const IconSettings = ({ title }: P) => svg([<circle cx="12" cy="12" r="3" />, <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />], title);
export const IconLab = ({ title }: P) => svg([<path d="M9 3h6" />, <path d="M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" />, <path d="M7.5 14h9" />], title);
export const IconNotebook = ({ title }: P) => svg([<rect x="5" y="3" width="14" height="18" rx="2" />, <path d="M9 7h6M9 11h6M9 15h3" />], title);
export const IconPaint = ({ title }: P) => svg([<path d="M4 20c3 0 5-2 5-5l9-9a2 2 0 0 0-3-3l-9 9c-3 0-5 2-5 5z" />], title);
