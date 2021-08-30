import { generateUnitTest } from "./main";

(() => {
  const filePaths = process.argv.slice(2);
  filePaths.forEach(async (filePath) => {
    generateUnitTest(filePath);
  });
})();
