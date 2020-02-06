import ts from "typescript";

export type UnaryNodeFactory<T = undefined, N extends ts.Node | ts.Node[] = ts.Node> = (props: T) => N;
export type NodeFactory<N extends ts.Node | ts.Node[] = ts.Node> = () => N;

export const tsc = <N extends ts.Node | ts.Node[] = ts.Node, T = undefined>(_strings: TemplateStringsArray, ..._substitutions: T extends undefined ? NodeFactory[] : UnaryNodeFactory<T>[]): T extends undefined ? NodeFactory<N> : UnaryNodeFactory<T, N>  => {
  throw new Error('tsc tag should be compiled via ts-transform-creator.');
}; 