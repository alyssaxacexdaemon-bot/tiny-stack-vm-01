// Tiny stack VM for make.fun tiny-stack-vm-01.
// Runs every /input/<id>/program.bin on its input.bin and writes
// /output/<id>/stdout.bin + exit.txt. Faithful to the kit's reference VM
// (program/generator/subject/vm.mjs): same step order, same trap codes.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const enc = new TextEncoder();

function run(p, inp) {
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let sp = 0, csp = 0, ol = 0, ip = 0, pc = 0, steps = 0;
  const done = (code) => ({ out: out.slice(0, ol), code });
  try {
    for (;;) {
      if (steps === 1000000) throw 10;
      if (pc < 0 || pc >= p.length) throw 9;
      const op = p[pc];
      const valid = op < 8 || (op >= 16 && op <= 30) || (op >= 32 && op <= 34) ||
        (op >= 48 && op <= 52) || op === 64 || op === 65 || (op >= 80 && op <= 83);
      if (!valid) throw 5;
      const imm = op === 1 ? 1 : op === 2 ? 4 : op >= 48 && op <= 51 ? 2 : 0;
      if (pc + imm >= p.length) throw 9;
      steps++;
      const nx = pc + 1 + imm;
      // Stack needs of this opcode: pops, pushes.
      let po = 0, pu = 0;
      if (op === 3) po = 1;
      else if (op === 4) { po = 1; pu = 2; }
      else if (op === 5) { po = 2; pu = 2; }
      else if (op === 6) { po = 2; pu = 3; }
      else if (op === 7) { po = 3; pu = 3; }
      else if (op === 1 || op === 2 || op === 82) pu = 1;
      else if (op === 64) { po = 1; pu = 1; }
      else if (op >= 16 && op <= 34) { po = op === 23 || op === 27 ? 1 : 2; pu = 1; }
      else if (op === 49 || op === 50 || op === 65 || op === 80 || op === 81 || op === 83) po = op === 65 ? 2 : 1;
      if (sp < po) throw 2;
      if (sp - po + pu > 256) throw 3;
      pc = nx;
      switch (op) {
        case 0: return done(0);
        case 1: D[sp++] = (p[nx - 1] << 24) >> 24; break;
        case 2: D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
        case 3: sp--; break;
        case 4: D[sp] = D[sp - 1]; sp++; break;
        case 5: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
        case 6: D[sp] = D[sp - 2]; sp++; break;
        case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
        case 23: D[sp - 1] = -D[sp - 1] | 0; break;
        case 27: D[sp - 1] = ~D[sp - 1]; break;
        case 16: case 17: case 18: case 19: case 20: case 21: case 22:
        case 24: case 25: case 26: case 28: case 29: case 30:
        case 32: case 33: case 34: {
          const b = D[sp - 1];
          const a = D[sp - 2];
          let r;
          if (op === 16) r = (a + b) | 0;
          else if (op === 17) r = (a - b) | 0;
          else if (op === 18) r = Math.imul(a, b);
          else if (op === 19) {
            if (b === 0) throw 4;
            r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
          } else if (op === 20) {
            if (b === 0) throw 4;
            r = b === -1 ? 0 : (a % b) | 0;
          } else if (op === 21) {
            if (b === 0) throw 4;
            r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
          } else if (op === 22) {
            if (b === 0) throw 4;
            r = ((a >>> 0) % (b >>> 0)) | 0;
          } else if (op === 24) r = a & b;
          else if (op === 25) r = a | b;
          else if (op === 26) r = a ^ b;
          else if (op === 28) r = a << (b & 31);
          else if (op === 29) r = a >> (b & 31);
          else if (op === 30) r = (a >>> (b & 31)) | 0;
          else if (op === 32) r = a === b ? 1 : 0;
          else if (op === 33) r = a < b ? 1 : 0;
          else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
          sp -= 2;
          D[sp++] = r;
          break;
        }
        case 48: case 49: case 50: {
          const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
          let take = true;
          if (op !== 48) { const v = D[--sp]; take = op === 49 ? v === 0 : v !== 0; }
          if (take) pc = nx + rel;
          break;
        }
        case 51:
          if (csp === 64) throw 7;
          C[csp++] = nx;
          pc = p[nx - 2] | (p[nx - 1] << 8);
          break;
        case 52:
          if (csp === 0) throw 8;
          pc = C[--csp];
          break;
        case 64: {
          const a = D[sp - 1];
          if (a < 0 || a >= 256) throw 6;
          D[sp - 1] = M[a];
          break;
        }
        case 65: {
          const a = D[sp - 1], v = D[sp - 2];
          if (a < 0 || a >= 256) throw 6;
          sp -= 2;
          M[a] = v;
          break;
        }
        case 80: {
          const b = enc.encode(String(D[sp - 1]));
          if (ol + b.length > 65536) throw 11;
          sp--;
          out.set(b, ol);
          ol += b.length;
          break;
        }
        case 81:
          if (ol + 1 > 65536) throw 11;
          out[ol++] = D[--sp] & 255;
          break;
        case 82: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
        case 83: return done(D[--sp] & 255);
      }
    }
  } catch (e) {
    if (typeof e === 'number') return done(e);
    throw e;
  }
}

for (const id of readdirSync(I).sort()) {
  const r = run(
    new Uint8Array(readFileSync(join(I, id, 'program.bin'))),
    new Uint8Array(readFileSync(join(I, id, 'input.bin'))),
  );
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
