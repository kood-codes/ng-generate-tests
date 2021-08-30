import path from "path";
import {
  CallExpression,
  ClassDeclaration,
  ConstructorDeclaration,
  MethodDeclaration,
  Node,
  ParameterDeclaration,
  SyntaxKind,
} from "ts-morph";
import { KeyValue, SelectorInfo } from "../models";
import {
  createObjectVariable,
  createProvider,
  createStubVariableNode,
  getDecoratorDetails,
  getDI,
  getDIRefs,
  getParamDetails,
  isObjectTruthy,
  toCamelCase,
} from "./index";

/**
 * Traverses required nodes in a class and extracts necessary details
 */
export function decodeClassDeclaration(
  classNode: ClassDeclaration,
  importedItems: KeyValue,
  filePath: string
): KeyValue {
  const templateBasePath = path.join(__dirname, "..", "templates");
  let stubDetails: KeyValue = {};
  let injectedItems: KeyValue | undefined;
  let injectedItemReferences: KeyValue;
  let methods: KeyValue = {};
  let classType = "Service";
  let selector: SelectorInfo | undefined;

  try {
    const classDecorator = getDecoratorDetails(classNode).filter(
      (decorator) => !!decorator.selectorInfo
    )[0];
    selector = classDecorator?.selectorInfo;
    classType = classDecorator?.name || classType;

    classNode.forEachDescendant((childNode: Node) => {
      switch (childNode.getKind()) {
        case SyntaxKind.Constructor:
          stubDetails = getDependencyInjectionDetails(
            childNode as ConstructorDeclaration
          );

          injectedItems = getDI(childNode as ConstructorDeclaration);
          injectedItemReferences = getDIRefs(
            childNode as ConstructorDeclaration
          );
          break;

        case SyntaxKind.MethodDeclaration:
          const methodDetails = getMethodDetails(
            childNode as MethodDeclaration,
            injectedItemReferences
          );
          if (methodDetails && isObjectTruthy(methodDetails)) {
            methods[methodDetails.name] = methodDetails;
          }
          break;
      }
    });

    return {
      methods,
      selector,
      name: classNode.getName(),
      fileName: path.parse(filePath).name,
      type: toCamelCase(classType),
      stub: stubDetails.stubs,
      providers: stubDetails.providers,
      imports: injectedItems?.map((item: string) => ({
        import: item,
        path: importedItems[item],
      })),
      templatePath: path.join(
        templateBasePath,
        `${toCamelCase(classType)}.ejs`
      ),
    };
  } catch (err) {
    throw err;
  }
}

/**
 * Extracts the name, param details and function calls to spy upon in a method.
 */
export function getMethodDetails(
  methodNode: MethodDeclaration,
  dependancyInjectionRefs: KeyValue
) {
  const methodName = (methodNode as MethodDeclaration).getName();
  const methodParams = getParamDetails(methodNode as MethodDeclaration);
  const methodSpies: KeyValue = {};
  const methodBody = (methodNode as MethodDeclaration).getBody();
  const callExpressions =
    methodBody && methodBody.getDescendantsOfKind(SyntaxKind.CallExpression);
  if (callExpressions && callExpressions.length) {
    callExpressions.forEach((callExpression: CallExpression) => {
      const property = callExpression.getChildrenOfKind(
        SyntaxKind.PropertyAccessExpression
      )[0];
      if (property) {
        const spyFn = property
          .getChildAtIndex(property.getChildren().length - 1)
          .getText();
        const thisExpression = property.getChildrenOfKind(
          SyntaxKind.PropertyAccessExpression
        )[0];
        if (thisExpression && dependancyInjectionRefs) {
          const injectedItemToSpy = thisExpression
            .getChildAtIndex(thisExpression.getChildren().length - 1)
            .getText();
          const spyRef = dependancyInjectionRefs[injectedItemToSpy];
          if (spyRef) {
            methodSpies[spyRef] = methodSpies[spyRef] || [];
            methodSpies[spyRef].push({
              spyFn,
            });
          }
        }
      }
    });
  }
  if (isObjectTruthy(methodSpies)) {
    return {
      name: methodName,
      params: methodParams,
      spies: methodSpies,
    };
  }
}

/**
 * Extracts DI details from the constructor and creates spy objects 
 */
export function getDependencyInjectionDetails(
  childNode: ConstructorDeclaration
) {
  const stub: KeyValue = {};
  const mockedStubMap: KeyValue = {};
  const params = childNode.getParameters();
  params.forEach((param: ParameterDeclaration) => {
    const refs = param.findReferencesAsNodes();
    let paramType =
      param.getType().getSymbol()?.getEscapedName() || param.getName();

    if (!!param.getDecorators) {
      param.getDecorators().forEach((decorator) => {
        if (decorator.getName() === "Inject") {
          paramType = decorator.getArguments()[0].getText();
        }
      });
    }

    for (const referencedNode of refs) {
      createStubVariableNode(referencedNode, paramType, stub, mockedStubMap);
    }
  });

  return Object.keys(stub).reduce(
    (acc: KeyValue, key: string) => {
      acc.stubs.push(createObjectVariable(`${key}Stub`, stub[key]));
      acc.providers.push(createProvider(key));
      return acc;
    },
    { stubs: [], providers: [] }
  );
}
