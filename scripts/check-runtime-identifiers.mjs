import ts from 'typescript';

// A focused runtime-crash check. Full typecheck remains a separate required report.
const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'jsconfig.json');
if (!configPath) throw new Error('jsconfig.json not found');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
if (parsed.errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, { getCanonicalFileName: x => x, getCurrentDirectory: ts.sys.getCurrentDirectory, getNewLine: () => '\n' }));
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
const errors = ts.getPreEmitDiagnostics(program).filter(diagnostic => [2304, 18004, 2552].includes(diagnostic.code));
if (errors.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: x => x, getCurrentDirectory: ts.sys.getCurrentDirectory, getNewLine: () => '\n' }));
  process.exitCode = 1;
} else console.log('No unresolved runtime identifiers in the application TypeScript program.');
