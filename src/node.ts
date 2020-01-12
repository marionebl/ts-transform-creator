import Ts from "typescript";

export function includes(a: Ts.Node, node: Ts.Node): boolean {
  while ((node = node.parent)) {
    if (a === node) {
      return true;
    }
  }

  return false;
}
