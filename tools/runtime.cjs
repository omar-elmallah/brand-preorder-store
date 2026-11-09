// Local in-memory Google-service adapters. Executes the real .gs files unchanged.
// This deliberately does not reproduce Google's permissions, quotas or persistence.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function createRuntime(options={}) {
  const state={active:'omar@example.test',effective:'omar@example.test',sheets:new Map(),props:{STORE_ADMIN_EMAILS:'omar@example.test,mustafa@example.test'},cache:new Map(),lock:false,...options};
  class Range {
    constructor(sheet,row,col,height=1,width=1) {Object.assign(this,{sheet,row,col,height,width});}
    getValues(){return Array.from({length:this.height},(_,r)=>Array.from({length:this.width},(_,c)=>this.sheet.data[this.row+r-1]?.[this.col+c-1]??''));}
    setValues(values){for(let r=0;r<this.height;r++)for(let c=0;c<this.width;c++){const idx=this.row+r-1;this.sheet.data[idx]??=[];const v=values[r][c];this.sheet.data[idx][this.col+c-1]=typeof v==='string'&&v.startsWith("'")?v.slice(1):v;}return this;}
    setValue(v){return this.setValues([[v]]);}
    setNumberFormat(){return this;} setFontWeight(){return this;} setBackground(){return this;}
  }
  class Sheet {
    constructor(name){this.name=name;this.data=[];}
    getRange(...args){return new Range(this,...args);} getLastRow(){return this.data.length;} getLastColumn(){return Math.max(0,...this.data.map(r=>r.length));}
    getDataRange(){return this.getRange(1,1,Math.max(1,this.getLastRow()),Math.max(1,this.getLastColumn()));}
    getMaxRows(){return Math.max(1000,this.getLastRow());} setFrozenRows(){} deleteRow(row){this.data.splice(row-1,1);}
  }
  class Spreadsheet {
    constructor(id){this.id=id;this.tabs=new Map();this.meta=[];}
    addDeveloperMetadata(key,value){this.meta.push({getKey:()=>key,getValue:()=>value});return this;}
    getDeveloperMetadata(){return this.meta;} setSpreadsheetTimeZone(zone){this.zone=zone;}
    getId(){return this.id;} getUrl(){return 'https://docs.google.com/spreadsheets/d/'+this.id;}
    getSheetByName(name){return this.tabs.get(name)||null;} insertSheet(name){const s=new Sheet(name);this.tabs.set(name,s);return s;}
  }
  const cache={put:(k,v,ttl)=>state.cache.set(k,{value:v,expires:Date.now()+ttl*1000}),get:k=>{const v=state.cache.get(k);return v&&v.expires>Date.now()?v.value:null;},remove:k=>state.cache.delete(k)};
  const context=vm.createContext({console:{log(){}},Date,Math,JSON,Object,Array,String,Number,Boolean,RegExp,Error,Set,Map,
    Session:{getActiveUser:()=>({getEmail:()=>state.active}),getEffectiveUser:()=>({getEmail:()=>state.effective})},
    ScriptApp:{getScriptId:()=> 'LOCAL-INDEPENDENT-BRAND-STORE'},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>state.props[k]??null,setProperty:(k,v)=>{state.props[k]=String(v);}})},
    CacheService:{getScriptCache:()=>cache},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(state.lock)return false;state.lock=true;return true;},releaseLock:()=>{state.lock=false;}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(String(s)).digest()).map(n=>n>127?n-256:n)},
    SpreadsheetApp:{create:()=>{const id=crypto.randomUUID();const ss=new Spreadsheet(id);state.sheets.set(id,ss);return ss;},openById:id=>{const ss=state.sheets.get(id);if(!ss)throw Error('Unknown spreadsheet');return ss;},flush:()=>{}},
  });
  const src=path.join(__dirname,'../src');
  for (const file of fs.readdirSync(src).filter(f=>f.endsWith('.gs')).sort())vm.runInContext(fs.readFileSync(path.join(src,file),'utf8'),context,{filename:file});
  if(options.setup!==false){const result=context.setupStore();if(!result.ok)throw Error(JSON.stringify(result));}
  return {context,state,call:(name,arg)=>context[name](arg),read:name=>JSON.parse(JSON.stringify(context.rows_(name))),setting:(key,value)=>context.patch_('Settings',key,{value}),ageToken:token=>{state.cache.get('checkout:'+context.sha256_(token)).value=String(Date.now()-10000);}};
}
module.exports={createRuntime};
