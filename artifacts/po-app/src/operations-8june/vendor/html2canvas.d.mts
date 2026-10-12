declare function html2canvas(
  element: HTMLElement,
  options?: {
    scale?: number;
    backgroundColor?: string | null;
    useCORS?: boolean;
    logging?: boolean;
    width?: number;
    height?: number;
  },
): Promise<HTMLCanvasElement>;

export default html2canvas;
