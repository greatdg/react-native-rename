#!/usr/bin/env node

// nS - No Space
// lC - Lowercase

import cheerio from 'cheerio';
import colors from 'colors';
import fs from 'fs';
import program from 'commander';
import replace from 'node-replace';
import shell from 'shelljs';
import pjson from '../package.json';
import path from 'path';
import { foldersAndFiles } from './config/foldersAndFiles';
import { filesToModifyContent } from './config/filesToModifyContent';
import { bundleIdentifiers } from './config/bundleIdentifiers';

const devTestRNProject = ''; // For Development eg '/Users/junedomingo/Desktop/RN49'
const __dirname = devTestRNProject || process.cwd();
const projectName = pjson.name;
const replaceOptions = {
  recursive: true,
  silent: true,
};

function readFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) reject(err);
      resolve(data);
    });
  });
}

function replaceContent(regex, replacement, paths) {
  replace({
    regex,
    replacement,
    paths,
    ...replaceOptions,
  });

  for (const filePath of paths) {
    console.log(`${filePath.replace(__dirname, '')} ${colors.green('MODIFIED')}`);
  }
}

const deletePreviousBundleDirectory = ({ oldBundleNameDir, shouldDelete }) => {
  if (shouldDelete) {
    const dir = oldBundleNameDir.replace(/\./g, '/');
    const deleteDirectory = shell.rm('-rf', dir);
    console.log('dir', dir);

    console.log('debug dir', dir.replace('/main/java/com', '/debug/java/com'));
    shell.rm('-rf', dir.replace('/main/java/com', '/debug/java/com'));

    Promise.resolve(deleteDirectory);
    console.log('Done removing previous bundle directory.'.green);
  } else {
    Promise.resolve();
    console.log('Bundle directory was not changed. Keeping...'.yellow);
  }
};

const cleanBuilds = () => {
  const deleteDirectories = shell.rm('-rf', [
    path.join(__dirname, 'ios/build/*'),
    path.join(__dirname, 'android/.gradle/*'),
    path.join(__dirname, 'android/app/build/*'),
    path.join(__dirname, 'android/build/*'),
  ]);
  Promise.resolve(deleteDirectories);
  console.log('Done removing builds.'.green);
};

readFile(path.join(__dirname, 'android/app/src/main/res/values/strings.xml'))
  .then(data => {
    const $ = cheerio.load(data);
    const currentAppName = $('string[name=app_name]').text();
    const nS_CurrentAppName = currentAppName.replace(/\s/g, '');
    const lC_Ns_CurrentAppName = nS_CurrentAppName.toLowerCase();

    program
      .version('2.4.1')
      .arguments('<newName>')
      .option('-b, --bundleID [value]', 'Set custom bundle identifier eg. "com.junedomingo.travelapp"')
      .action(newName => {
        const nS_NewName = newName.replace(/\s/g, '');
        const pattern = /^([\p{Letter}\p{Number}])+([\p{Letter}\p{Number}\s]+)$/u;
        const lC_Ns_NewAppName = nS_NewName.toLowerCase();
        const bundleID = program.bundleID ? program.bundleID.toLowerCase() : null;
        let newBundlePath;
        let newDebugBundlePath;
        const listOfFoldersAndFiles = foldersAndFiles(currentAppName, newName);
        const listOfFilesToModifyContent = filesToModifyContent(currentAppName, newName, projectName);

        if (bundleID) {
          newBundlePath = bundleID.replace(/\./g, '/');
          const id = bundleID.split('.');
          if (id.length < 2)
            return console.log(
              'Invalid Bundle Identifier. Add something like "com.travelapp" or "com.junedomingo.travelapp"'
            );
        }

        if (!pattern.test(newName)) {
          return console.log(
            `"${newName}" is not a valid name for a project. Please use a valid identifier name (alphanumeric and space).`
          );
        }

        if (newName === currentAppName || newName === nS_CurrentAppName || newName === lC_Ns_CurrentAppName) {
          return console.log('Please try a different name.');
        }

        // Move files and folders from ./config/foldersAndFiles.js
        const resolveFoldersAndFiles = new Promise(resolve => {
          listOfFoldersAndFiles.forEach((element, index) => {
            const dest = element.replace(new RegExp(nS_CurrentAppName, 'i'), nS_NewName);
            let itemsProcessed = 1;
            const successMsg = `/${dest} ${colors.green('RENAMED')}`;

            setTimeout(() => {
              itemsProcessed += index;

              if (fs.existsSync(path.join(__dirname, element)) || !fs.existsSync(path.join(__dirname, element))) {
                const move = shell.exec(
                  `git mv "${path.join(__dirname, element)}" "${path.join(__dirname, dest)}" 2>/dev/null`
                );

                if (move.code === 0) {
                  console.log(successMsg);
                } else if (move.code === 128) {
                  // if "outside repository" error occured
                  if (shell.mv('-f', path.join(__dirname, element), path.join(__dirname, dest)).code === 0) {
                    console.log(successMsg);
                  } else {
                    console.log("Ignore above error if this file doesn't exist");
                  }
                }
              }

              if (itemsProcessed === listOfFoldersAndFiles.length) {
                resolve();
              }
            }, 200 * index);
          });
        });

        // Modify file content from ./config/filesToModifyContent.js
        const resolveFilesToModifyContent = () =>
          new Promise(resolve => {
            let filePathsCount = 0;
            let itemsProcessed = 0;
            listOfFilesToModifyContent.map(file => {
              filePathsCount += file.paths.length;

              file.paths.map((filePath, index) => {
                const newPaths = [];

                setTimeout(() => {
                  itemsProcessed++;
                  if (fs.existsSync(path.join(__dirname, filePath))) {
                    newPaths.push(path.join(__dirname, filePath));
                    replaceContent(file.regex, file.replacement, newPaths);
                  }
                  if (itemsProcessed === filePathsCount) {
                    resolve();
                  }
                }, 200 * index);
              });
            });
          });

        const resolveJavaFiles = () =>
          new Promise(resolve => {
            readFile(path.join(__dirname, 'android/app/src/main/AndroidManifest.xml')).then(data => {
              const $ = cheerio.load(data);
              const currentBundleID = $('manifest').attr('package');
              const newBundleID = program.bundleID ? bundleID : `com.${lC_Ns_NewAppName}`;
              const javaFileBase = '/android/app/src/main/java';
              const javaDebugFileBase = '/android/app/src/debug/java';

              const newJavaPath = `${javaFileBase}/${newBundleID.replace(/\./g, '/')}`;
              const currentJavaPath = `${javaFileBase}/${currentBundleID.replace(/\./g, '/')}`;

              const newDebugJavaPath = `${javaDebugFileBase}/${newBundleID.replace(/\./g, '/')}`;
              const currentDebugJavaPath = `${javaDebugFileBase}/${currentBundleID.replace(/\./g, '/')}`;

              if (bundleID) {
                newBundlePath = newJavaPath;
                newDebugBundlePath = newDebugJavaPath;
              } else {
                newBundlePath = newBundleID.replace(/\./g, '/').toLowerCase();
                newBundlePath = `${javaFileBase}/${newBundlePath}`;
                newDebugBundlePath = `${javaDebugFileBase}/${newBundlePath}`;
              }

              console.log(`Moving Main from ${currentJavaPath} to ${newJavaPath}`);

              const fullCurrentBundlePath = path.join(__dirname, currentJavaPath);
              const fullNewBundlePath = path.join(__dirname, newBundlePath);

              // Create new bundle folder if doesn't exist yet
              if (!fs.existsSync(fullNewBundlePath)) {
                shell.mkdir('-p', fullNewBundlePath);
                const move = shell.exec(`git mv "${fullCurrentBundlePath}/"* "${fullNewBundlePath}" 2>/dev/null`);
                const successMsg = `${newBundlePath} ${colors.green('BUNDLE INDENTIFIER CHANGED')}`;

                if (move.code === 0) {
                  console.log(successMsg);
                } else if (move.code === 128) {
                  // if "outside repository" error occured
                  if (shell.mv('-f', fullCurrentBundlePath + '/*', fullNewBundlePath).code === 0) {
                    console.log(successMsg);
                  } else {
                    console.log(`Error moving: "${currentJavaPath}" "${newBundlePath}"`);
                  }
                }
              }

              console.log(`Moving Debug from ${currentDebugJavaPath} to ${newDebugBundlePath}`);

              const fullCurrentDebugBundlePath = path.join(__dirname, currentDebugJavaPath);
              const fullNewDebugBundlePath = path.join(__dirname, newDebugBundlePath);

              // Create new bundle folder if doesn't exist yet
              if (!fs.existsSync(fullNewDebugBundlePath)) {
                shell.mkdir('-p', fullNewDebugBundlePath);
                const move = shell.exec(
                  `git mv "${fullCurrentDebugBundlePath}/"* "${fullNewDebugBundlePath}" 2>/dev/null`
                );
                const successMsg = `${newDebugBundlePath} ${colors.green('BUNDLE INDENTIFIER CHANGED')}`;

                if (move.code === 0) {
                  console.log(successMsg);
                } else if (move.code === 128) {
                  // if "outside repository" error occured
                  if (shell.mv('-f', fullCurrentDebugBundlePath + '/*', fullNewDebugBundlePath).code === 0) {
                    console.log(successMsg);
                  } else {
                    console.log(`Error moving: "${currentDebugJavaPath}" "${newDebugBundlePath}"`);
                  }
                }
              }

              const vars = {
                currentBundleID,
                newBundleID,
                newBundlePath,
                javaFileBase,
                currentJavaPath,
                newJavaPath,
                newDebugBundlePath,
                javaDebugFileBase,
                currentDebugJavaPath,
                newDebugJavaPath,
              };
              resolve(vars);
            });
          });

        const resolveBundleIdentifiers = params =>
          new Promise(resolve => {
            let filePathsCount = 0;
            let itemsProcessed = 0;
            const {
              currentBundleID,
              newBundleID,
              newBundlePath,
              javaFileBase,
              currentJavaPath,
              newJavaPath,
              newDebugBundlePath,
            } = params;

            bundleIdentifiers(
              currentAppName,
              newName,
              projectName,
              currentBundleID,
              newBundleID,
              newBundlePath,
              newDebugBundlePath
            ).map(file => {
              filePathsCount += file.paths.length;

              file.paths.map((filePath, index) => {
                const newPaths = [];
                console.log('filePath', filePath);
                if (fs.existsSync(path.join(__dirname, filePath))) {
                  newPaths.push(path.join(__dirname, filePath));
                  itemsProcessed += 1;
                  console.log('being itemsProcessed', itemsProcessed, 'index', index);
                  replaceContent(file.regex, file.replacement, newPaths);
                }
              });
            });
            console.log('itemsProcessed', itemsProcessed);
            console.log('filePathsCount', filePathsCount);
            if (itemsProcessed === filePathsCount) {
              const oldBundleNameDir = path.join(__dirname, javaFileBase, currentBundleID);
              resolve({
                oldBundleNameDir,
                shouldDelete: currentJavaPath !== newJavaPath,
              });
            }
          });

        const rename = () => {
          resolveFoldersAndFiles
            .then(resolveFilesToModifyContent)
            .then(resolveJavaFiles)
            .then(resolveBundleIdentifiers)
            .then(deletePreviousBundleDirectory)
            .then(cleanBuilds)
            .then(() => console.log(`APP SUCCESSFULLY RENAMED TO "${newName}"! 🎉 🎉 🎉`.green))
            .then(() => {
              if (fs.existsSync(path.join(__dirname, 'ios', 'Podfile'))) {
                console.log(
                  `${colors.yellow('Podfile has been modified, please run "pod install" inside ios directory.')}`
                );
              }
            })
            .then(() =>
              console.log(
                `${colors.yellow(
                  'Please make sure to run "watchman watch-del-all" and "npm start --reset-cache" before running the app. '
                )}`
              )
            );
        };

        rename();
      })
      .parse(process.argv);
    if (!process.argv.slice(2).length) program.outputHelp();
  })
  .catch(err => {
    if (err.code === 'ENOENT') return console.log('Directory should be created using "react-native init"');

    return console.log('Something went wrong: ', err);
  });
