import { transformSourceFileChildren } from "./transformer";
import ts from "typescript";

export default function create(code: string): ts.Expression {
  const file = ts.createSourceFile("temporary.ts", code, ts.ScriptTarget.Latest);
  const result = transformSourceFileChildren(file);
  return (result.statements[0] as any).expression.elements[0];
}
