import { tsquery } from "@phenomnomnominal/tsquery";
import { Transformer } from "ts-transformer-testing-library";
import tsTransformCreator from "./transform";
import { ModuleKind } from "typescript";

const transformer = new Transformer()
  .addMock({
    name: "ts-transform-creator",
    content: `
    import ts from "typescript";

    export type UnaryNodeFactory<T = undefined, N extends ts.Node | ts.Node[] = ts.Node> = (props: T) => N;
    export type NodeFactory<N extends ts.Node | ts.Node[] = ts.Node> = () => N;
    
    export const tsc = <N extends ts.Node | ts.Node[] = ts.Node, T = undefined>(_strings: TemplateStringsArray, ..._substitutions: T extends undefined ? NodeFactory[] : UnaryNodeFactory<T>[]): T extends undefined ? NodeFactory<N> : UnaryNodeFactory<T, N>  => {
      throw new Error('tsc tag should be compiled via ts-transform-creator.');
    }; 
    `
  })
  .addMock({
    name: "typescript",
    content: `
      export interface Node { kind: "Node"; }
      export interface StringLiteral { kind: "StringLiteral"; }
      export interface Identifier { kind: "Identifier"; }
      export interface ArrowFunction { kind: "ArrowFunction"; }
      export interface ReturnStatement { kind: "ReturnStatement"; }
      export interface Block { kind: "Block" };
      export type Expression = any;
      export type Statement = any;

      export const createStringLiteral = (input: string): StringLiteral => ({ kind: "StringLiteral" });
      export const createIdentifier = (input: string): Identifier => ({ kind: "Identifier" });
      export const createReturn = (input: Expression): ReturnStatement => ({ kind: "ReturnStatement" });
      export const createBlock = (statements: Statement[]): Block => ({ kind: "Block" });

      export default {
        Node,
        ArrowFunction,
        Block,
        StringLiteral,
        Identifier,
        createReturn,
        createStringLiteral,
        createIdentifier,
        createBlock
      };
  `
  })
  .addTransformer(tsTransformCreator);

test("removes tagged template literal", () => {
  const result = transformer.transform(`
    import ts from "typescript";
    import {tsc} from "ts-transform-creator";
    tsc\`\`
  `);

  const ast = tsquery.ast(result);
  expect(
    tsquery(ast, 'TaggedTemplateExpression Identifier[name="ts"]')
  ).toHaveLength(0);
});

test("retains unrelated tagged template literal", () => {
  const result = transformer.transform(`
    import ts from "typescript";
    import {tsc as other} from "ts-transform-creator";
    const tsc = (strings: TemplateStringsArray): any => strings;
    tsc\`\`
  `);

  const ast = tsquery.ast(result);
  expect(
    tsquery(ast, 'TaggedTemplateExpression Identifier[name="tsc"]')
  ).toHaveLength(1);
});

test("removes tagged template literal with renamed import", () => {
  const result = transformer.transform(`
    import ts from "typescript";
    import {tsc as other} from "ts-transform-creator";
    other\`\`
  `);

  const ast = tsquery.ast(result);
  expect(
    tsquery(ast, 'TaggedTemplateExpression Identifier[name="ts"]')
  ).toHaveLength(0);
});

test("works for commonjs output", () => {
  const result = transformer.setCompilerOptions({ module: ModuleKind.CommonJS })
    .transform(`
      import ts from "typescript";
      import {tsc} from "ts-transform-creator";
      console.log(ts);
      export const greeting = tsc\`"Hello, World!"\`
    `);

  const ast = tsquery.ast(result);
  const required = tsquery(
    ast,
    'VariableDeclaration:has([name="ts"]):has(CallExpression [name="require"])'
  );
  expect(required).toHaveLength(1);
});

test("works for static template strings", () => {
  const result = transformer.transform(`
    import ts from "typescript";
    import {tsc} from "ts-transform-creator";
    tsc\`"Hello, World!"\`
  `);

  const ast = tsquery.ast(result);
  expect(
    tsquery(ast, 'ArrowFunction:has(StringLiteral[value="Hello, World!"])')
  ).toHaveLength(1);
});

test("works for string interpolations", () => {
  const result = transformer.transform(`
    import ts from "typescript";
    import {tsc} from "ts-transform-creator";
    type Named = { name: string };
    tsc<unknown, Named>\`console.log(\${(props: Named) => ts.createStringLiteral('Hello, ' + props.name + 'World!')\})\`;
  `);

  expect(result).toMatch(
    `ts.createStringLiteral('Hello, ' + props.name + 'World!')`
  );
});

test("replaces nested tags", () => {
  const result = transformer.transform(`
    import ts, {StringLiteral} from "typescript";
    import {tsc} from "ts-transform-creator";
    type Named = { name: string };
    tsc<unknown, Named>\`\${(props: Named) => 
      tsc<StringLiteral, Named>\`\${(props: Named) => ts.createStringLiteral('Hello, ' + props.name + 'World!')\}\`(props)
    \}\`;
  `);

  expect(result).toMatch(
    `(((props) => (props => { const ts = require("typescript"); return ts.createExpressionStatement(((props) => ts.createStringLiteral(\'Hello, \' + props.name + \'World!\'))(props)); })(props))(props))`
  );
});

test("works for aliased interpolations", () => {
  const result = transformer.transform(`
    import ts from "typescript";
    import {tsc} from "ts-transform-creator";
    type Named = { name: string };

    const createHello = (props: Named) => ts.createStringLiteral('Hello, ' + props.name + 'World!');
    tsc<unknown, Named>\`console.log(\${createHello\})\`;
  `);

  expect(result).toMatch(`createHello(props)`);
});

test("works for identifiers", () => {
  const result = transformer.transform(`
    import ts from "typescript";
    import {tsc} from "ts-transform-creator";
    type Named = { name: string };

    tsc<unknown, Named>\`() => \${(p: Named) => ts.createIdentifier(p.name)\}\`;
  `);

  expect(result).toMatch(`((p) => ts.createIdentifier(p.name))(props)`);
});

test("works for return statements", () => {
  const result = transformer.transform(`
    import ts from "typescript";
    import {tsc} from "ts-transform-creator";
    type Named = { name: string };

    tsc<unknown, Named>\`() => {\${(p: Named) => ts.createReturn(ts.createIdentifier(p.name))\}}\`;
  `);

  expect(result).toMatch(
    `ts.createBlock([((p) => ts.createReturn(ts.createIdentifier(p.name)))(props)]`
  );
});

test("works for blocks", () => {
  const result = transformer.transform(`
    import ts from "typescript";
    import {tsc} from "ts-transform-creator";
    type Named = { name: string };

    tsc<unknown, Named>\`() => \${(p: Named) => ts.createBlock([ts.createReturn(ts.createIdentifier(p.name))])\}}\`;
  `);

  expect(result).toMatch(
    `((p) => ts.createBlock([ts.createReturn(ts.createIdentifier(p.name))]))(props)))`
  );
});
