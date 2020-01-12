import ts from "typescript";
import { tsquery } from "@phenomnomnominal/tsquery";
import uuid from "uuid";
import { includes } from "./node";
import creator from "./ts-creator";
import { createTsCall } from "./ts-creator/helper";

interface CompilationContext {
  context: ts.TransformationContext;
  program: ts.Program;
  checker: ts.TypeChecker;
}

export default function getTransformer(
  program: ts.Program
): ts.TransformerFactory<ts.SourceFile> {
  const checker = program.getTypeChecker();

  return context => {
    return file => {
      const imports = tsquery(
        file,
        'ImportDeclaration:has(StringLiteral[value="ts-transform-creator"])'
      );

      if (imports.length === 0) {
        return file;
      }

      const visitor = (node: ts.Node): ts.Node => {
        if (ts.isTaggedTemplateExpression(node)) {
          const symbol = checker.getSymbolAtLocation(node.tag);
          const declarations = symbol ? symbol.getDeclarations() || [] : [];

          if (intersect(imports, declarations, includes)) {
            return createCreatorFunction(node.template, {checker, program, context});
          }
        }

        return ts.visitEachChild(node, visitor, context);
      };

      return ts.visitNode(file, visitor);
    };
  };
}

function createCreatorFunction(template: ts.TemplateLiteral, ctx: CompilationContext): ts.ArrowFunction {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return ts.createArrowFunction(
      undefined,
      undefined,
      [
        ts.createParameter(undefined, undefined, undefined, "props")
      ],
      undefined,
      undefined,
      template.text === ""
        ? createTsCall("createEmptyStatement")
        : creator(template.text)
    );
  }

  const result = template.templateSpans.reduce((acc, span) => {
    const type = getReturnType(span.expression, ctx);
    const symbol = type.getSymbol();
    const name = symbol ? symbol.getName() : undefined;

    if (name === "StringLiteral") {
      const id = uuid.v4().split("-").join("");

      // TODO: Handle various inputs, e.g. arrow functions with bodies, identifieres
      acc.registry.set(id, (span.expression as any).body);

      return {
        source: `${acc.source}"${id}"${span.literal.text}`,
        registry: acc.registry
      };
    }

    return acc;
  }, { source: template.head.text, registry: new Map<string, ts.Expression>() });

  const expression = creator(result.source);

  const visitFactoryCode = (node: ts.Node): ts.Node => {
    const resume = () => ts.visitEachChild(node, visitFactoryCode, ctx.context);

    if (!ts.isCallExpression(node)) {
      return resume();
    }

    if (!ts.isPropertyAccessExpression(node.expression)) {
      return resume();
    }

    if (!ts.isIdentifier(node.expression.expression)) {
      return resume();
    }

    if (node.expression.expression.escapedText !== "ts") {
      return resume();
    }

    switch (node.expression.name.escapedText) {
      case 'createStringLiteral': {
        const arg = node.arguments[0];
        if (!arg || !ts.isStringLiteral(arg)) {
          return resume();
        }

        const replacement = result.registry.get(arg.text);
        return replacement ? replacement : resume();
      }
    }

    return resume();
  };

  const injected = ts.visitNode(expression, visitFactoryCode);

  return ts.createArrowFunction(
    undefined,
    undefined,
    [
      ts.createParameter(undefined, undefined, undefined, "props")
    ],
    undefined,
    undefined,
    injected
  );
}

function intersect<A, B>(a: A[], b: B[], p: (a: A, b: B) => boolean): boolean {
  return a.some(ai => b.some(bi => p(ai, bi)));
}

function getReturnType(node: ts.Node, ctx: CompilationContext): ts.Type {
  // TODO: Remove private property access hack
  const symbol = ctx.checker.getSymbolAtLocation(node) || (node as any).symbol as ts.Symbol;
  const type = ctx.checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration);
  const signature = type.getCallSignatures()[0];
  return signature.getReturnType();
}
