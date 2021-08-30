export type SelectorInfo = {
  name: string;
  type: string;
}

export type KeyValue = {
    [key: string]: any;
}

export type DecoratorInfo = {
  name: string;
  selectorInfo?: SelectorInfo;
}