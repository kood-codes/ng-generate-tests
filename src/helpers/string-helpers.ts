import { render } from "ejs";
import path from "path";
import * as fs from "fs-extra";
import { KeyValue, SelectorInfo } from "../models";

export async function renderTemplateWithData({
  name,
  fileName,
  type = "component",
  stub,
  providers,
  imports,
  methods,
  selector,
  templatePath,
}: KeyValue) {
  const template = await fs.readFile(templatePath, "utf8");
  const generatedSpec = render(template, {
    name,
    fileName,
    selector,
    stub,
    providers,
    imports,
    methods,
    helpers: { toCamelCase },
  });

  return generatedSpec;
}

export function getCssSelectorInfo(selectorStr: string): SelectorInfo {
  let selector = selectorStr.split(",")[0];
  let selectorType = "element";
  if (selector.match(/\[.*?\]/)) {
    selectorType = "attribute";
    selector = selector.substr(1, selector.length - 2);
  } else if (selector[0] === ".") {
    selectorType = "class";
    selector = selector.substring(1);
  }

  return {
    name: selector,
    type: selectorType,
  };
}

export function getFileName(filePath: string) {
  let fileName = filePath.split(path.sep).pop() || "";

  return fileName.endsWith(".ts")
    ? fileName.substring(0, fileName.length - 3)
    : fileName;
}

export function getTsConfigFilePath(filePath: string) {
  const parsedPath = path.parse(filePath);
  const folders = parsedPath.dir.split(path.sep);
  let tsConfigPath;
  while (folders.length) {
    tsConfigPath = path.join(folders.join(path.sep), "tsconfig.json");
    if (fs.existsSync(tsConfigPath)) break;
    else folders.pop();
  }
  return tsConfigPath;
}

export function getSpecFilePath(filePath: string) {
  const { dir, name } = path.parse(filePath);
  let index = 0;
  let specFilePath = path.join(dir, `${name}.spec.ts`);
  while (fs.pathExistsSync(specFilePath)) {
    specFilePath = path.join(dir, `${name}.${++index}.spec.ts`);
  }
  return specFilePath;
}

export function toCamelCase(str = "") {
  return str.length > 1
    ? str[0].toLowerCase() + str.substring(1)
    : str.toLowerCase();
}
