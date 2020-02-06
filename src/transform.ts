import ts from "typescript";
import { tsquery } from "@phenomnomnominal/tsquery";
import uuid from "uuid";
import { includes } from "./node";
import creator from "./ts-creator";
import { createTsCall } from "./ts-creator/helper";
import { tsc } from "./ts-transform-creator";

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
            const creator = createCreatorFunction(node.template, {
              checker,
              program,
              context
            });

            return ts.visitEachChild(creator, visitor, context);
          }
        }

        return ts.visitEachChild(node, visitor, context);
      };

      return ts.visitNode(file, visitor);
    };
  };
}

function createCreatorFunction(
  template: ts.TemplateLiteral,
  ctx: CompilationContext
): ts.ArrowFunction {
  const result = ts.isNoSubstitutionTemplateLiteral(template)
    ? { source: template.text, registry: new Map() }
    : template.templateSpans.reduce(
        (acc, span) => {
          const type = getReturnType(span.expression, ctx);

          if (!type) {
            return acc;
          }

          const symbol = type.getSymbol();
          const name = symbol ? symbol.getName() : undefined;

          const id = `a${uuid
            .v4()
            .split("-")
            .join("")}`;

          acc.registry.set(
            id,
            ts.createCall(span.expression, undefined, [
              ts.createIdentifier("props")
            ])
          );

          switch (name) {
            case "Block": {
              return {
                source: `${acc.source}{ ${id} }${span.literal.text}`,
                registry: acc.registry
              };
            }
            case "Identifier": {
              return {
                source: `${acc.source}${id}${span.literal.text}`,
                registry: acc.registry
              };
            }
            case "ReturnStatement": {
              return {
                source: `${acc.source}return ${id};${span.literal.text}`,
                registry: acc.registry
              };
            }
            case "StringLiteral": {
              return {
                source: `${acc.source}"${id}"${span.literal.text}`,
                registry: acc.registry
              };
            }
            default:
              console.log(span.expression.getFullText());
              console.warn(name);
          }

          return acc;
        },
        {
          source: template.head.text,
          registry: new Map<string, ts.Expression>()
        }
      );

  const expression =
    result.source === ""
      ? createTsCall("createEmptyStatement")
      : creator(result.source);

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
      case "createBlock": {
        const args = node.arguments[0];

        if (!ts.isArrayLiteralExpression(args)) {
          return resume();
        }

        const arg = args.elements[0];

        if (!arg || !ts.isCallExpression(arg)) {
          return resume();
        }

        if (!ts.isPropertyAccessExpression(arg.expression)) {
          return resume();
        }

        if (!ts.isIdentifier(arg.expression.expression)) {
          return resume();
        }

        if (
          arg.expression.expression.escapedText !== "ts" ||
          arg.expression.name.escapedText !== "createExpressionStatement"
        ) {
          return resume();
        }

        const idArg = arg.arguments[0];

        if (!idArg || !ts.isCallExpression(idArg)) {
          return resume();
        }

        if (!ts.isPropertyAccessExpression(idArg.expression)) {
          return resume();
        }

        if (!ts.isIdentifier(idArg.expression.expression)) {
          return resume();
        }

        if (
          idArg.expression.expression.escapedText !== "ts" ||
          idArg.expression.name.escapedText !== "createIdentifier"
        ) {
          return resume();
        }

        const idLiteral = idArg.arguments[0];

        if (!idLiteral || !ts.isStringLiteral(idLiteral)) {
          return resume();
        }

        const replacement = result.registry.get(idLiteral.text);
        return replacement ? replacement : resume();
      }
      case "createReturn": {
        const arg = node.arguments[0];
        
        if (!arg || !ts.isCallExpression(arg)) {
          return resume();
        }

        if (!ts.isPropertyAccessExpression(arg.expression)) {
          return resume();
        }

        if (!ts.isIdentifier(arg.expression.expression)) {
          return resume();
        }

        if (
          arg.expression.expression.escapedText !== "ts" ||
          arg.expression.name.escapedText !== "createIdentifier"
        ) {
          return resume();
        }

        const idArg = arg.arguments[0];
        if (!idArg || !ts.isStringLiteral(idArg)) {
          return resume();
        }
        const replacement = result.registry.get(idArg.text);
        return replacement ? replacement : resume();
      }
      case "createStringLiteral":
      case "createIdentifier": {
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
    [ts.createParameter(undefined, undefined, undefined, "props")],
    undefined,
    undefined,
    ts.createBlock([
      ts.createVariableStatement(
        undefined,
        ts.createVariableDeclarationList(
          [
            ts.createVariableDeclaration(
              "ts",
              undefined,
              ts.createCall(ts.createIdentifier("require"), undefined, [
                ts.createStringLiteral("typescript")
              ])
            )
          ],
          ts.NodeFlags.Const
        )
      ),
      ts.createReturn(injected)
    ])
  );
}

function intersect<A, B>(a: A[], b: B[], p: (a: A, b: B) => boolean): boolean {
  return a.some(ai => b.some(bi => p(ai, bi)));
}

function getReturnType(
  node: ts.Node,
  ctx: CompilationContext
): ts.Type | undefined {
  // TODO: Remove private property access hack
  const symbol =
    ctx.checker.getSymbolAtLocation(node) ||
    ((node as any).symbol as ts.Symbol | undefined);

  if (!symbol) {
    return;
  }

  const type = ctx.checker.getTypeOfSymbolAtLocation(
    symbol,
    symbol.valueDeclaration
  );
  const signature = type.getCallSignatures()[0];
  return signature.getReturnType();
}
