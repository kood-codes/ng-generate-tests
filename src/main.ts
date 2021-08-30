import * as fs from "fs-extra";
import { Project, SourceFile } from "ts-morph";
import {
  getImportDeclarations,
  getSpecFilePath,
  getTsConfigFilePath,
  renderTemplateWithData,
  decodeClassDeclaration,
} from "./helpers";

export function generateUnitTest(filePath: string) {
  try {
    const tsConfigFilePath = getTsConfigFilePath(filePath);
    const project = new Project({
      tsConfigFilePath,
      addFilesFromTsConfig: false,
    });
    project.addSourceFileAtPath(filePath);

    const src: SourceFile = project.getSourceFileOrThrow(filePath);
    const importedItems = getImportDeclarations(src);
    const classes = src.getClasses();

    if (!classes?.length) {
      throw "No class found";
    }

    classes.forEach(async (classItem) => {
      const extractedInfo = decodeClassDeclaration(
        classItem,
        importedItems,
        filePath
      );
      const generatedTest = await renderTemplateWithData(extractedInfo);

      console.log("--- Generated test in path ---", getSpecFilePath(filePath));
      fs.writeFileSync(getSpecFilePath(filePath), generatedTest);
    });
  } catch (error) {
    throw "Error generating unit test";
  }
}