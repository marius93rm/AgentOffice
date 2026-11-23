import { Platform } from "react-native";

/**
 * The only file that touches what a browser has and a phone does not. Each
 * export says what it needs of a node and nothing more, does its work on the
 * web and nothing anywhere else.
 */
export const ON_WEB = Platform.OS === "web";

export interface AgentKeyEvent {
  key: string;
  preventDefault(): void;
  stopPropagation(): void;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  target?: unknown;
  currentTarget?: unknown;
}

/** React Native Web gives Pressable a real key handler. Native retains standard accessibility activation. */
export function agentArrowKeys(move: (direction: -1 | 1) => void, horizontal = false): object {
  if (!ON_WEB) return {};
  return {
    onKeyDown: (event: AgentKeyEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target !== event.currentTarget) return;
      const direction = event.key === "ArrowUp" || (horizontal && event.key === "ArrowLeft") ? -1
        : event.key === "ArrowDown" || (horizontal && event.key === "ArrowRight") ? 1 : 0;
      if (!direction) return;
      event.preventDefault();
      event.stopPropagation();
      move(direction);
    },
  };
}

export function focusAgent(ref: unknown): void {
  if (ref && typeof ref === "object" && "focus" in ref && typeof ref.focus === "function") ref.focus();
}

/** What `slideTo` needs of the node behind a View's ref on the web. */
interface Slidable {
  style: { transform: string };
}

/**
 * Slides a mounted view sideways by a share of its own width, written straight
 * onto its node: no state changes, nothing is rendered again. The view's own
 * style must not set a transform, or the next render would put that back.
 */
export function slideTo(node: unknown, percent: number): void {
  if (!ON_WEB || node === null || typeof node !== "object" || !("style" in node)) return;
  (node as Slidable).style.transform = `translateX(${percent}%)`;
}

/** What `recall` and `remember` need of the browser's local storage. */
interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = "agent-lobby:";
// A phone keeps what was set until the app closes; so does a browser that refuses storage.
const session = new Map<string, string>();

function storage(): Storage | null {
  if (!ON_WEB) return null;
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** What this device was last told to keep under `key`: on the web across visits, elsewhere for this session. */
export function recall(key: string): string | null {
  const kept = session.get(key);
  if (kept !== undefined) return kept;
  try {
    return storage()?.getItem(PREFIX + key) ?? null;
  } catch {
    return null;
  }
}

/** Keeps `value` under `key` on this device, or forgets it for null. */
export function remember(key: string, value: string | null): void {
  if (value === null) session.delete(key);
  else session.set(key, value);
  try {
    const store = storage();
    if (value === null) store?.removeItem(PREFIX + key);
    else store?.setItem(PREFIX + key, value);
  } catch {
    // Full or refused: the session copy still holds.
  }
}

/** The pointer a resize handle shows on the web: a column or a row resize. Nothing elsewhere. */
export function resizeCursor(across: boolean): object | null {
  return ON_WEB ? { cursor: across ? "col-resize" : "row-resize" } : null;
}

/** What `anchorScroll` needs of a ScrollView: the node that scrolls. */
interface Scrollable {
  getScrollableNode(): unknown;
}

/**
 * Turns the browser's scroll anchoring on or off for a ScrollView, written straight onto its node:
 * nothing is rendered again. Anchoring keeps what is in view in place when content above it
 * changes. While a chat follows its end that is wrong: when its oldest line goes as a new one
 * comes, the height stays the same and the browser scrolls up by the line it dropped, hiding the new
 * one. Once scrolled up to read, it is right: without it the line being read moves.
 */
export function anchorScroll(scroller: unknown, anchored: boolean): void {
  if (!ON_WEB || scroller === null || typeof scroller !== "object" || !("getScrollableNode" in scroller)) return;
  const node = (scroller as Scrollable).getScrollableNode();
  if (node === null || typeof node !== "object" || !("style" in node)) return;
  (node as { style: { overflowAnchor: string } }).style.overflowAnchor = anchored ? "" : "none";
}

interface DownloadLink {
  href: string;
  download: string;
  click(): void;
  remove(): void;
}
interface CanvasContext {
  createImageData(width: number, height: number): { data: Uint8ClampedArray };
  putImageData(data: { data: Uint8ClampedArray }, x: number, y: number): void;
}
interface SnapshotCanvas {
  width: number;
  height: number;
  getContext(kind: "2d"): CanvasContext | null;
  toDataURL(type: "image/png"): string;
}
interface CaptureDocument {
  createElement(name: "canvas"): SnapshotCanvas;
  createElement(name: "a"): DownloadLink;
  body: { appendChild(link: DownloadLink): void };
}
function captureDocument(): CaptureDocument | undefined {
  return ON_WEB ? (globalThis as { document?: CaptureDocument }).document : undefined;
}

export function canExportOffice(): boolean {
  return Boolean(captureDocument()?.createElement("canvas").getContext("2d"));
}

export function downloadOffice(image: { width: number; height: number; pixels: Uint8ClampedArray }): boolean {
  const doc = captureDocument();
  if (!doc) return false;
  const canvas = doc.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const data = ctx.createImageData(image.width, image.height);
  data.data.set(image.pixels);
  ctx.putImageData(data, 0, 0);
  const link = doc.createElement("a");
  link.href = canvas.toDataURL("image/png");
  if (!link.href.startsWith("data:image/png;")) return false;
  link.download = "agent-lobby.png";
  doc.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
  return true;
}
