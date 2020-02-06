# ts-transform-creator

> :warning: WIP - most likely this is not useful to you yet

> Generate parameterized node factories from TypeScript source strings

The TypeScript compiler API provides a complete set of methods to create
any node known in the TypeScript AST, e.g. `createStringLiteral`.

This is great for transforming nodes to desired transformation results but
tends to be verbose for complex scenarios.

## Installation

```
yarn add -D ts-transform-creator
```

## Usage

```ts
// source.ts
import ts from "typescript";
import { tsc } from "ts-transform-creator";

interface HelloWorldProps {
  name: string;
}

const createHelloWorld = tsc<HelloWorldProps>`() => ${props =>
  ts.createStringLiteral("Hello, " + props.name + "!")}`;
```

```ts
// source.ts
import ts from "typescript";

const createHelloWorld = props =>
  ts.createExpressionStatement(
    ts.createCall(
      ts.createPropertyAccess(
        ts.createIdentifier("console"),
        ts.createIdentifier("log")
      ),
      undefined,
      [ts.createStringLiteral("Hello, " + props.name + "World!")]
    )
  );
```

## Supported Nodes

* [x] StringLiteral
* [x] Identifier
* [x] ReturnStatement
* [x] Block
* [ ] ConciseBody
* [ ] ArrayLiteralExpression
* [ ] ObjectExpression
* [ ] NumericLiteral
* [ ] Node[]



## License

MIT. Copyright 2019 - present Mario Nebl
