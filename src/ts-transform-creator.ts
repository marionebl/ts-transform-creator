import Ts from "typescript";

export type NodeFactory<T> = (props: T) => Ts.Node;

export const tsc = <T = {}>(_strings: TemplateStringsArray, ..._substitutions: NodeFactory<T>[]): NodeFactory<T> => {
  throw new Error(`ts tag should be compiled via ts-transform-creator.`);
}; 