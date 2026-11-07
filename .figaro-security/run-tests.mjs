import {execFileSync} from 'node:child_process';
import {scannerPath,cleanEnvironment} from './install-scanner.mjs';
execFileSync(process.execPath,['--test',new URL('./guard.test.mjs',import.meta.url).pathname],{env:{...cleanEnvironment(),FIGARO_TEST_SCANNER:scannerPath(process.cwd())},stdio:'inherit',timeout:60000});
