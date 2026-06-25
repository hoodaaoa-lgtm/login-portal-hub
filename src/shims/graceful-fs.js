// Stub for graceful-fs in the Cloudflare Worker SSR bundle.
// workerd's polyfilled `fs` module is not extensible, so graceful-fs's
// `gracefulify(fs)` throws "Cannot define property Symbol(graceful-fs.queue),
// object is not extensible" at module init, crashing every SSR request.
// We don't need EMFILE queue handling in workerd — just re-export fs.
import * as fs from "node:fs";

const noop = () => {};
const identity = (x) => x;

const shim = {
  ...fs,
  gracefulify: noop,
  createReadStream: fs.createReadStream,
  createWriteStream: fs.createWriteStream,
};

export default shim;
export const gracefulify = noop;
export const close = fs.close;
export const closeSync = fs.closeSync;
