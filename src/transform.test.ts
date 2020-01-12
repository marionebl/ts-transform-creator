import { tsquery } from "@phenomnomnominal/tsquery";
import { Transformer } from "ts-transformer-testing-library";
import tsTransformCreator from "./transform";

const transformer = new Transformer()
  .addMock({
    name: "ts-transform-creator",
    content: `
    export const tsc = <T = {}>(strings: TemplateStringsArray, ...substitutions: NodeFactory<T>[]): NodeFactory<T> => {
      throw new Error('ts tag should be compiled via ts-transform-creator.');
    };
  `
  })
  .addMock({
    name: "typescript",
    content: `
    export interface StringLiteral { kind: "StringLiteral"; }

    export const createStringLiteral = (input: string): StringLiteral => ({ kind: "StringLiteral" });

    export default {
      createStringLiteral
    };
  `
  })
  .addTransformer(tsTransformCreator);

test("removes tagged template literal", () => {
  const result = transformer.transform(`
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
    import {tsc as other} from "ts-transform-creator";
    const ts = (strings: TemplateStringsArray): any => strings;
    ts\`\`
  `);

  const ast = tsquery.ast(result);
  expect(
    tsquery(ast, 'TaggedTemplateExpression Identifier[name="ts"]')
  ).toHaveLength(1);
});

test("removes tagged template literal with renamed import", () => {
  const result = transformer.transform(`
    import {tsc as other} from "ts-transform-creator";
    other\`\`
  `);

  const ast = tsquery.ast(result);
  expect(
    tsquery(ast, 'TaggedTemplateExpression Identifier[name="ts"]')
  ).toHaveLength(0);
});

test("works for static template strings", () => {
  const result = transformer.transform(`
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
    export const create = tsc<{ name: string }>\`console.log(\${(props) => ts.createStringLiteral('Hello, ' + props.name + 'World!')\})\`;
  `);

  expect(result).toMatch(`ts.createStringLiteral('Hello, ' + props.name + 'World!')`);
});
