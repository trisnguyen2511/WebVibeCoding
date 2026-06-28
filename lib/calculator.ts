export function calculate(a: number, b: number, op: string): number | null {
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': return b === 0 ? null : a / b
    default:  return null
  }
}
