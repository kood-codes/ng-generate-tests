import { of, Subject } from "rxjs";
import {
  ClassDeclaration,
  ConstructorDeclaration,
  Decorator,
  ImportDeclaration,
  ImportSpecifier,
  MethodDeclaration,
  NamedImports,
  Node,
  ObjectLiteralExpression,
  ParameterDeclaration,
  printNode,
  PropertyAccessExpression,
  PropertyAssignment,
  SourceFile,
  StringLiteral,
  SyntaxKind,
  ts,
  TypeGuards,
} from "ts-morph";
import { DecoratorInfo, KeyValue } from "../models";
import { getCssSelectorInfo, toCamelCase } from "./string-helpers";

/**
 * Creates a map of imported items with its resolved path
 */
export function getImports(node: ImportDeclaration) {
  const importPath = getImportPath(node.getModuleSpecifier());
  const importNames: string[] = getImportName(
    node.getImportClause()!.getNamedBindings() as NamedImports
  );
  return importNames.reduce(
    (acc: { [key: string]: string }, importName: string) => {
      acc[importName] = importPath;
      return acc;
    },
    {}
  );
}

/**
 * Extracts the name of imported item
 */
export function getImportName(node: NamedImports): string[] {
  return node
    .getElements()
    .map((element: ImportSpecifier) => element.getName());
}

/**
 * Extracts the path of imported item
 */
export function getImportPath(node: StringLiteral): string {
  return node.compilerNode.text;
}

/**
 * Extracts the names of all DI items from the constructor node
 */
export function getDI(node: ConstructorDeclaration) {
  return node.getParameters().map((parameter: ParameterDeclaration) => {
    const symbol = parameter.getType().getSymbol();
    let name = parameter.getName();
    if (symbol) {
      name = symbol.getName();
    }
    if (!!parameter.getDecorators) {
      parameter.getDecorators().forEach((decorator: Decorator) => {
        if (decorator.getName() === "Inject") {
          name = decorator.getArguments()[0].getText();
        }
      });
    }
    return name;
  });
}

/**
 * Extracts the member references of an DI item
 */
export function getDIRefs(node: ConstructorDeclaration): {
  [key: string]: string;
} {
  return node
    .getParameters()
    .reduce(
      (acc: { [key: string]: string }, parameter: ParameterDeclaration) => {
        const symbol = parameter.getType().getSymbol();
        if (symbol) {
          acc[parameter.getName()] = symbol.getName();
        }
        if (!!parameter.getDecorators) {
          parameter.getDecorators().forEach((decorator: Decorator) => {
            if (decorator.getName() === "Inject") {
              acc[parameter.getName()] = decorator.getArguments()[0].getText();
            }
          });
        }
        return acc;
      },
      {}
    );
}

/**
 * Extracts the details of a decorator such as name, selector etc
 */
export function getDecoratorDetails(
  classNode: ClassDeclaration
): DecoratorInfo[] {
  const decorators: DecoratorInfo[] = [];
  classNode.getDecorators().forEach((decorator) => {
    const decoratorObject = decorator.getArguments()[0];

    if (decoratorObject) {
      const selector = (decoratorObject as ObjectLiteralExpression)
        .getProperties()
        .filter(
          (property) => (<PropertyAssignment>property)?.getName() === "selector"
        )?.[0];
      const selectText: string =
        (selector?.getChildAtIndex(2) as KeyValue)?.getLiteralText() || "";
      decorators.push({
        name: decorator.getName(),
        selectorInfo: selectText ? getCssSelectorInfo(selectText) : undefined,
      });
    } else {
      decorators.push({
        name: decorator.getName(),
      });
    }
  });

  return decorators;
}

/**
 * Extracts paramters detail from a provided method node
 */
export function getParamDetails(node: MethodDeclaration) {
  const params: object[] = [];
  node.getParameters().forEach((param) => {
    const paramType = param.getType().getSymbol()
      ? param.getType().getSymbol()!.getEscapedName()
      : param.getType().getText();
    params.push({
      name: param.getName(),
      value: createVariable(param.getName(), paramType),
    });
  });

  return params;
}

/**
 * Creates an provider object Node
 * Example { provide: SomeService, useValue: someServiceStub }
 */
export function createProvider(name: string) {
  return printNode(
    ts.createObjectLiteral([
      ts.createPropertyAssignment("provide", ts.createIdentifier(name)),
      ts.createPropertyAssignment(
        "useValue",
        ts.createIdentifier(`${toCamelCase(name)}Stub`)
      ),
    ])
  );
}

/**
 * Creates an variable node
 */
export function createVariable(name: string, type: string) {
  let value = null;
  switch (type) {
    case "string":
      value = ts.createStringLiteral("");
      break;
    case "number":
      value = ts.createNumericLiteral("1");
      break;
    case "boolean":
      value = ts.createIdentifier("true");
      break;
    case "Array":
    case "array":
      value = ts.createIdentifier("[]");
      break;
    default:
      value = ts.createObjectLiteral([], true);
  }
  return printNode(ts.createVariableDeclaration(name, undefined, value));
}

/**
 * Creates an object variable node
 */
export function createObjectVariable(name: string, properties: any) {
  const expression = ts.createObjectLiteral(properties, true);

  return printNode(
    ts.createVariableDeclaration(toCamelCase(name), undefined, expression)
  );
}

/**
 * Extracts import declatations from source file
 */
export function getImportDeclarations(src: SourceFile) {
  let importedItems: KeyValue = {};
  src.forEachDescendant((node) => {
    switch (node.getKind()) {
      case ts.SyntaxKind.ImportDeclaration:
        importedItems = {
          ...importedItems,
          ...getImports(node as ImportDeclaration),
        };
        break;
    }
  });

  return importedItems;
}

/**
 * Scans the class fode for expressions access with thisKeyword and returns those expressions
 */
export function getPropertyAccessExpression(
  classNode: ClassDeclaration
): PropertyAccessExpression[] {
  return classNode
    .getDescendantsOfKind(SyntaxKind.ThisKeyword)
    .filter((thisNode: Node) => {
      const parent = thisNode.getParent() as PropertyAccessExpression;
      let parentName = "";
      if (typeof parent.getName === "function") {
        parentName = parent.getName();
      }
      return !!parentName; // && !!structParams[parentName]
    })
    .map((thisNode) => thisNode.getParent() as PropertyAccessExpression);
}

/**
 * Creates the stub for any injected item.
 * ex: 
 * const contactsHttpServiceStub = {
 *  getContacts: () => () => of({}),
 *  postContacts: () => () => of({})
 * };
 */
export function createStubVariableNode(
  referencedNode: Node,
  paramType: string,
  stub: KeyValue,
  mockedStub: KeyValue
) {
  const parent = referencedNode.getParent();
  if (parent && TypeGuards.isPropertyAccessExpression(parent)) {
    const expression = parent.getParent();
    if (expression) {
      const callee = expression!.getChildAtIndex(
        expression.getChildren().length - 1
      );
      const propertyToStub = callee.getText();

      for (let ancestor of expression.getAncestors()) {
        if (
          TypeGuards.isPropertyAccessExpression(ancestor) ||
          TypeGuards.isPropertyDeclaration(ancestor)
        ) {
          if (ancestor.getType()?.getSymbol()) {
            const ancestorType = ancestor.getType().getSymbol()!.getName();
            stub[paramType] = stub[paramType] || [];
            mockedStub[paramType] = mockedStub[paramType] || {};
            if (
              ancestorType.indexOf("Subject") > -1 ||
              ancestorType === "next"
            ) {
              if (!mockedStub[paramType][propertyToStub]) {
                stub[paramType].push(
                  ts.createPropertyAssignment(
                    propertyToStub,
                    ts.createIdentifier(`new Subject()`)
                  )
                );
              }
              mockedStub[paramType][propertyToStub] = new Subject();
            } else if (
              ancestorType === "Observable" ||
              ancestorType === "pipe"
            ) {
              if (!mockedStub[paramType][propertyToStub]) {
                stub[paramType].push(
                  ts.createPropertyAssignment(
                    propertyToStub,
                    ts.createIdentifier(`of({})`)
                  )
                );
              }
              mockedStub[paramType][propertyToStub] = of({});
            } else {
              if (!mockedStub[paramType][propertyToStub]) {
                stub[paramType].push(
                  ts.createPropertyAssignment(
                    propertyToStub,
                    ts.createStringLiteral("PLEASE PROVIDE YOUR MOCK HERE")
                  )
                );
              }
              mockedStub[paramType][propertyToStub] =
                "PLEASE PROVIDE YOUR MOCK HERE";
            }
            break;
          }
        }
        if (TypeGuards.isCallExpression(ancestor)) {
          if (ancestor.getReturnType()?.getSymbol()) {
            stub[paramType] = stub[paramType] || [];
            mockedStub[paramType] = mockedStub[paramType] || {};
            if (
              ancestor.getReturnType().getSymbol()?.getName() === "Observable"
            ) {
              if (!mockedStub[paramType][propertyToStub]) {
                stub[paramType].push(
                  ts.createPropertyAssignment(
                    propertyToStub,
                    ts.createIdentifier(`() => () => of({})`)
                  )
                );
              }
              mockedStub[paramType][propertyToStub] = () => () => of({});
            } else {
              if (!mockedStub[paramType][propertyToStub]) {
                stub[paramType].push(
                  ts.createPropertyAssignment(
                    propertyToStub,
                    ts.createIdentifier(`() => () => {}`)
                  )
                );
              }
              mockedStub[paramType][propertyToStub] = () => () => {};
            }
          }
        }
      }
    }
  }
}
