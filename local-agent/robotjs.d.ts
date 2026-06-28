declare module 'robotjs' {
  function keyToggle(key: string, direction: 'down' | 'up', modifier?: string | string[]): void
  function keyTap(key: string, modifier?: string | string[]): void
  function typeString(string: string): void
  function moveMouse(x: number, y: number): void
  function mouseClick(button?: string, double?: boolean): void
  function mouseToggle(down?: string, button?: string): void
  function scrollMouse(x: number, y: number): void
  function getMousePos(): { x: number; y: number }
  function getPixelColor(x: number, y: number): string
  function getScreenSize(): { width: number; height: number }
}
