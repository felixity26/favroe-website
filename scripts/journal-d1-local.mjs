import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export class LocalD1 {
 constructor(path=':memory:'){this.db=new DatabaseSync(path);this.db.exec(readFileSync(new URL('../journal-migrations/0001_journal.sql',import.meta.url),'utf8'));}
 prepare(sql){const db=this.db;let args=[];const norm=a=>a instanceof ArrayBuffer?new Uint8Array(a):a;return {bind(...a){args=a.map(norm);return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},_run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},async run(){return this._run();}};}
 async batch(statements){this.db.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of statements)out.push(s._run());this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
